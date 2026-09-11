"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";

type LinkedServer = {
  id: string;
  name: string;
  host: string;
  outboundMode: string;
  vpnEgressActive: boolean;
};

type VpnRow = {
  id: string;
  name: string;
  kind: string;
  localHttpPort: number;
  interfaceName: string;
  isActive: boolean;
  hasConfig: boolean;
  notes: string | null;
  _count: { servers: number };
  linkedServers?: LinkedServer[];
};

type ServerOpt = {
  id: string;
  name: string;
  host: string;
  outboundMode: string;
  vpnProfileId: string | null;
};

export default function AdminVpnProfilesPage() {
  const [profiles, setProfiles] = useState<VpnRow[]>([]);
  const [servers, setServers] = useState<ServerOpt[]>([]);
  const [vpnActiveServers, setVpnActiveServers] = useState<ServerOpt[]>([]);
  const [msg, setMsg] = useState("");
  const [configFileName, setConfigFileName] = useState("");
  const [form, setForm] = useState({
    name: "",
    kind: "WIREGUARD",
    configText: "",
    localHttpPort: 18080,
    interfaceName: "wg-nexlify0",
    notes: "",
  });
  const [targetServerId, setTargetServerId] = useState("");
  const [applyProfileId, setApplyProfileId] = useState("");
  const [applyServerId, setApplyServerId] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    fetch("/api/admin/vpn-profiles")
      .then((r) => r.json())
      .then((d) => {
        setProfiles(d.profiles ?? []);
        setServers(d.servers ?? []);
        setVpnActiveServers(d.vpnActiveServers ?? []);
      });
    fetch("/api/admin/servers")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.servers ?? []).map((s: ServerOpt) => ({
          id: s.id,
          name: s.name,
          host: s.host,
          outboundMode: s.outboundMode ?? "NONE",
          vpnProfileId: s.vpnProfileId ?? null,
        }));
        if (!targetServerId && list[0]) setTargetServerId(list[0].id);
        if (!applyServerId && list[0]) setApplyServerId(list[0].id);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function onConfigFile(file: File | null) {
    if (!file) return;
    setConfigFileName(file.name);
    const text = await file.text();
    const lower = file.name.toLowerCase();
    let kind = form.kind;
    if (lower.endsWith(".ovpn")) kind = "OPENVPN";
    else if (/^\s*\[Interface\]/im.test(text)) kind = "WIREGUARD";
    else if (/^\s*client\s/m.test(text)) kind = "OPENVPN";
    setForm((f) => ({
      ...f,
      configText: text,
      kind,
      interfaceName: kind === "OPENVPN" ? f.interfaceName || "tun-nexlify0" : f.interfaceName || "wg-nexlify0",
    }));
  }

  async function add(e: React.FormEvent, opts?: { applyAndTest?: boolean }) {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/vpn-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          serverId: targetServerId || undefined,
          runTest: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? (data.errors?.[0] as string) ?? "Failed to create");
        return;
      }
      const profileId = data.profile?.id as string;
      setApplyProfileId(profileId);
      let summary = `Saved profile “${data.profile?.name}”.`;
      if (data.test) {
        summary += data.test.ok
          ? ` Config OK${data.test.checks?.length ? ` (${data.test.checks.filter((c: { ok: boolean }) => c.ok).length}/${data.test.checks.length} checks)` : ""}.`
          : ` Test: ${data.test.message}`;
      }
      if (opts?.applyAndTest && profileId && targetServerId) {
        setApplyServerId(targetServerId);
        const applyRes = await fetch("/api/admin/vpn-profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "apply",
            serverId: targetServerId,
            vpnProfileId: profileId,
          }),
        });
        const applyData = await applyRes.json();
        if (applyRes.ok && applyData.ok) {
          const testRes = await fetch("/api/admin/vpn-profiles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "test",
              serverId: targetServerId,
              vpnProfileId: profileId,
            }),
          });
          const testData = await testRes.json();
          summary += applyData.local ? " Applied on this panel host." : " Applied on LB.";
          summary += testData.ok ? " Live VPN test passed." : ` Live test: ${testData.message}`;
        } else {
          summary += ` Apply failed: ${applyData.message || applyData.error}`;
        }
      }
      setMsg(summary);
      setForm({
        name: "",
        kind: "WIREGUARD",
        configText: "",
        localHttpPort: 18080,
        interfaceName: "wg-nexlify0",
        notes: "",
      });
      setConfigFileName("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this VPN profile? Servers using it will be unlinked.")) return;
    await fetch(`/api/admin/vpn-profiles?id=${id}`, { method: "DELETE" });
    load();
  }

  async function apply(dryRun: boolean) {
    setBusy(true);
    setMsg(dryRun ? "Dry-run…" : "Applying…");
    try {
      const res = await fetch("/api/admin/vpn-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          serverId: applyServerId,
          vpnProfileId: applyProfileId,
          dryRun,
        }),
      });
      const data = await res.json();
      setMsg(
        data.ok
          ? `${data.message}${data.local ? " (local panel host)" : ""}${data.remoteOutput ? ` — ${String(data.remoteOutput).slice(0, 160)}` : ""}`
          : data.message || data.error || "Apply failed"
      );
      if (data.ok && !dryRun) load();
    } finally {
      setBusy(false);
    }
  }

  async function testLive() {
    if (!applyProfileId) return;
    setBusy(true);
    setMsg("Running VPN test…");
    try {
      const res = await fetch("/api/admin/vpn-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          serverId: applyServerId || undefined,
          vpnProfileId: applyProfileId,
        }),
      });
      const data = await res.json();
      const checks =
        data.checks?.map((c: { name: string; ok: boolean; detail?: string }) =>
          `${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? ` (${c.detail})` : ""}`
        ) ?? [];
      setMsg(
        data.ok
          ? `${data.message}${checks.length ? `\n${checks.join("\n")}` : ""}`
          : `${data.message}${checks.length ? `\n${checks.join("\n")}` : ""}`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "#00c0ef" }}>
          VPN egress tunnels
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Upload or paste WireGuard / OpenVPN client configs. Apply on the LB (local when the panel
          runs on that server, otherwise SSH). Set{" "}
          <Link href="/admin/servers" className="underline" style={{ color: "#00c0ef" }}>
            Manage Servers
          </Link>{" "}
          → Outbound → VPN to route live pulls through the tunnel.
        </p>
      </div>

      {vpnActiveServers.length > 0 && (
        <section
          className="rounded-lg border px-4 py-3"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#00c0ef" }}>
            VPN egress active on
          </h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {vpnActiveServers.map((s) => (
              <li
                key={s.id}
                className="rounded-full border px-3 py-1"
                style={{ borderColor: "var(--border)", color: "var(--text)" }}
              >
                <strong>{s.name}</strong>
                <span style={{ color: "var(--muted)" }}> · {s.host}</span>
                {s.vpnProfileId && (
                  <span style={{ color: "var(--muted)" }}>
                    {" "}
                    · profile{" "}
                    {profiles.find((p) => p.id === s.vpnProfileId)?.name ?? s.vpnProfileId.slice(0, 8)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        className="rounded-lg border p-4 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#00c0ef" }}>
          Add profile
        </h2>
        <form onSubmit={(e) => void add(e)} className="grid gap-3 md:grid-cols-2">
          <input
            className="rounded border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <select
            className="rounded border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
          >
            <option value="WIREGUARD">WireGuard (.conf)</option>
            <option value="OPENVPN">OpenVPN (.ovpn)</option>
          </select>
          <label
            className="md:col-span-2 flex flex-col gap-1 rounded border border-dashed px-3 py-4 text-sm cursor-pointer"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
          >
            <span style={{ color: "var(--muted)" }}>
              Upload config file {configFileName ? `— ${configFileName}` : "(.conf / .ovpn / .wg)"}
            </span>
            <input
              type="file"
              accept=".conf,.ovpn,.wg,text/plain"
              className="text-xs"
              onChange={(e) => void onConfigFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <select
            className="rounded border px-3 py-2 text-sm md:col-span-2"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            value={targetServerId}
            onChange={(e) => setTargetServerId(e.target.value)}
          >
            <option value="">Target LB (for apply & test after save)…</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.host}
                {String(s.outboundMode).toUpperCase() === "VPN" ? " · VPN on" : ""}
              </option>
            ))}
          </select>
          <input
            className="rounded border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            placeholder="Interface (wg-nexlify0)"
            value={form.interfaceName}
            onChange={(e) => setForm({ ...form, interfaceName: e.target.value })}
          />
          <input
            type="number"
            className="rounded border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            placeholder="Local HTTP port"
            value={form.localHttpPort}
            onChange={(e) => setForm({ ...form, localHttpPort: Number(e.target.value) || 18080 })}
          />
          <textarea
            className="rounded border px-3 py-2 text-sm md:col-span-2 font-mono"
            style={{ borderColor: "var(--border)", background: "var(--bg)", minHeight: 140 }}
            placeholder="Or paste WireGuard / OpenVPN client config…"
            value={form.configText}
            onChange={(e) => setForm({ ...form, configText: e.target.value })}
            required
          />
          <div className="md:col-span-2 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded px-4 py-2 text-sm font-medium text-white"
              style={{ background: "#00c0ef" }}
            >
              Save & validate config
            </button>
            <button
              type="button"
              disabled={busy || !targetServerId}
              className="rounded border px-4 py-2 text-sm font-medium"
              style={{ borderColor: "var(--border)" }}
              onClick={(e) => void add(e as unknown as React.FormEvent, { applyAndTest: true })}
            >
              Save, apply on LB & test
            </button>
          </div>
        </form>
      </section>

      <section
        className="rounded-lg border p-4 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#00c0ef" }}>
          Apply or test on server
        </h2>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            className="rounded border px-3 py-2 text-sm min-w-[200px]"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            value={applyProfileId}
            onChange={(e) => setApplyProfileId(e.target.value)}
          >
            <option value="">VPN profile…</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.kind})
              </option>
            ))}
          </select>
          <select
            className="rounded border px-3 py-2 text-sm min-w-[240px]"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            value={applyServerId}
            onChange={(e) => setApplyServerId(e.target.value)}
          >
            <option value="">Stream server / LB…</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.host}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
            disabled={!applyProfileId || !applyServerId || busy}
            onClick={() => void apply(true)}
          >
            Dry-run
          </button>
          <button
            type="button"
            className="rounded px-3 py-2 text-sm text-white"
            style={{ background: "#00c0ef" }}
            disabled={!applyProfileId || !applyServerId || busy}
            onClick={() => void apply(false)}
          >
            Apply tunnel
          </button>
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
            disabled={!applyProfileId || busy}
            onClick={() => void testLive()}
          >
            Test VPN
          </button>
        </div>
        {msg && (
          <pre
            className="text-xs whitespace-pre-wrap rounded border px-3 py-2"
            style={{ color: "var(--muted)", borderColor: "var(--border)" }}
          >
            {msg}
          </pre>
        )}
      </section>

      <DataTable
        headers={["Name", "Kind", "Active on servers", "Iface", "Port", "Active", ""]}
        rows={profiles.map((p) => [
          p.name,
          p.kind,
          p.linkedServers?.length ? (
            <span key={`${p.id}-srv`} className="text-xs">
              {p.linkedServers.map((s) => (
                <span key={s.id} className="block">
                  {s.name}
                  {s.vpnEgressActive ? (
                    <span className="text-emerald-400"> · VPN egress ON</span>
                  ) : (
                    <span style={{ color: "var(--muted)" }}> · linked</span>
                  )}
                </span>
              ))}
            </span>
          ) : (
            "—"
          ),
          p.interfaceName,
          p.localHttpPort,
          p.isActive ? "yes" : "no",
          <button key={p.id} type="button" className="text-xs text-red-400" onClick={() => void remove(p.id)}>
            Delete
          </button>,
        ])}
      />
    </div>
  );
}
