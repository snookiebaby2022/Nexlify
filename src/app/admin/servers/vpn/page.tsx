"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";

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
};

type ServerOpt = { id: string; name: string; host: string };

export default function AdminVpnProfilesPage() {
  const [profiles, setProfiles] = useState<VpnRow[]>([]);
  const [servers, setServers] = useState<ServerOpt[]>([]);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    name: "",
    kind: "WIREGUARD",
    configText: "",
    localHttpPort: 18080,
    interfaceName: "wg-nexlify0",
    notes: "",
  });
  const [applyServerId, setApplyServerId] = useState("");
  const [applyProfileId, setApplyProfileId] = useState("");

  function load() {
    fetch("/api/admin/vpn-profiles")
      .then((r) => r.json())
      .then((d) => setProfiles(d.profiles ?? []));
    fetch("/api/admin/servers")
      .then((r) => r.json())
      .then((d) => setServers((d.servers ?? []).map((s: ServerOpt) => ({ id: s.id, name: s.name, host: s.host }))));
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/admin/vpn-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Failed to create");
      return;
    }
    setForm({
      name: "",
      kind: "WIREGUARD",
      configText: "",
      localHttpPort: 18080,
      interfaceName: "wg-nexlify0",
      notes: "",
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this VPN profile? Servers using it will be unlinked.")) return;
    await fetch(`/api/admin/vpn-profiles?id=${id}`, { method: "DELETE" });
    load();
  }

  async function apply(dryRun: boolean) {
    setMsg(dryRun ? "Dry-run…" : "Applying on LB…");
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
        ? `${data.message}${data.remoteOutput ? ` — ${String(data.remoteOutput).slice(0, 180)}` : ""}`
        : data.message || data.error || "Apply failed"
    );
    if (data.ok && !dryRun) load();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "#00c0ef" }}>
          VPN egress tunnels
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          WireGuard/OpenVPN profiles for LB <em>ingest</em> egress. After apply, the LB runs a local HTTP
          CONNECT gateway on 127.0.0.1 — same pull path as stream proxies. Assign per server under Manage
          Servers (Outbound mode → VPN).
        </p>
      </div>

      <section
        className="rounded-lg border p-4 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#00c0ef" }}>
          Add profile
        </h2>
        <form onSubmit={add} className="grid gap-3 md:grid-cols-2">
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
            <option value="WIREGUARD">WireGuard</option>
            <option value="OPENVPN">OpenVPN</option>
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
            placeholder="Paste WireGuard or OpenVPN client config…"
            value={form.configText}
            onChange={(e) => setForm({ ...form, configText: e.target.value })}
            required
          />
          <button
            type="submit"
            className="rounded px-4 py-2 text-sm font-medium text-white md:col-span-2"
            style={{ background: "#00c0ef" }}
          >
            Save VPN profile
          </button>
        </form>
      </section>

      <section
        className="rounded-lg border p-4 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#00c0ef" }}>
          Apply to LB (SSH)
        </h2>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            className="rounded border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            value={applyProfileId}
            onChange={(e) => setApplyProfileId(e.target.value)}
          >
            <option value="">Profile…</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className="rounded border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            value={applyServerId}
            onChange={(e) => setApplyServerId(e.target.value)}
          >
            <option value="">Server…</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.host})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
            disabled={!applyProfileId || !applyServerId}
            onClick={() => void apply(true)}
          >
            Dry-run
          </button>
          <button
            type="button"
            className="rounded px-3 py-2 text-sm text-white"
            style={{ background: "#00c0ef" }}
            disabled={!applyProfileId || !applyServerId}
            onClick={() => void apply(false)}
          >
            Apply tunnel
          </button>
        </div>
        {msg && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {msg}
          </p>
        )}
      </section>

      <DataTable
        headers={["Name", "Kind", "Iface", "Local port", "Servers", "Active", ""]}
        rows={profiles.map((p) => [
          p.name,
          p.kind,
          p.interfaceName,
          p.localHttpPort,
          p._count?.servers ?? 0,
          p.isActive ? "yes" : "no",
          <button key={p.id} type="button" className="text-xs text-red-400" onClick={() => void remove(p.id)}>
            Delete
          </button>,
        ])}
      />
    </div>
  );
}
