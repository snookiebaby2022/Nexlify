"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IpWithFlag } from "@/components/ip-with-flag";

type ServerRow = {
  id: string;
  name: string;
  host: string;
  dnsRotator?: { mode?: string; hosts?: string[] } | null;
};

export default function StreamToolsPage() {
  const [msg, setMsg] = useState("");
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [mainDns, setMainDns] = useState("");
  const [dnsMode, setDnsMode] = useState<"round_robin" | "random">("round_robin");
  const [savingDns, setSavingDns] = useState(false);

  const loadServers = useCallback(() => {
    fetch("/api/admin/servers")
      .then((r) => r.json())
      .then((d) => setServers(d.servers ?? []));
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  async function flushCache() {
    await fetch("/api/admin/cache", { method: "POST" });
    setMsg("Stream/category cache flushed");
  }

  async function applyDnsToAll() {
    const hosts = mainDns
      .split(/[\n,]+/)
      .map((h) => h.trim())
      .filter(Boolean);
    const dnsRotator = hosts.length ? { mode: dnsMode, hosts } : null;
    setSavingDns(true);
    setMsg("");
    let ok = 0;
    for (const s of servers) {
      const res = await fetch("/api/admin/servers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, dnsRotator }),
      });
      if (res.ok) ok++;
    }
    setSavingDns(false);
    setMsg(hosts.length ? `DNS rotator updated on ${ok} server(s).` : `DNS rotator cleared on ${ok} server(s).`);
    loadServers();
  }

  async function applyDnsOne(serverId: string, hostsText: string, mode: "round_robin" | "random") {
    const hosts = hostsText
      .split(/[\n,]+/)
      .map((h) => h.trim())
      .filter(Boolean);
    const dnsRotator = hosts.length ? { mode, hosts } : null;
    const res = await fetch("/api/admin/servers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: serverId, dnsRotator }),
    });
    setMsg(res.ok ? "Server DNS updated." : (await res.json()).error ?? "Update failed");
    loadServers();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap gap-3">
        <h1 className="text-2xl font-semibold flex-1">Stream tools</h1>
        <Link href="/admin/management/tools" className="text-sm" style={{ color: "var(--accent)" }}>
          ← Tools
        </Link>
      </div>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Utilities for live streams, DNS rotation on stream servers, and cache.
      </p>

      <section
        className="rounded-lg border p-4 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="font-medium">DNS rotator (all servers)</h2>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Applies the same upstream hostname list to every active stream server. Streams inherit server DNS when resolving play URLs.
        </p>
        <select
          className="rounded border px-3 py-2 bg-transparent text-sm"
          style={{ borderColor: "var(--border)" }}
          value={dnsMode}
          onChange={(e) => setDnsMode(e.target.value as "round_robin" | "random")}
        >
          <option value="round_robin">Round robin</option>
          <option value="random">Random</option>
        </select>
        <textarea
          className="w-full rounded border px-3 py-2 bg-transparent font-mono text-sm"
          style={{ borderColor: "var(--border)" }}
          rows={4}
          placeholder="cdn1.example.com&#10;cdn2.example.com"
          value={mainDns}
          onChange={(e) => setMainDns(e.target.value)}
        />
        <button
          type="button"
          disabled={savingDns || !servers.length}
          onClick={applyDnsToAll}
          className="rounded px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {savingDns ? "Applying…" : "Apply to all servers"}
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium text-sm">Per-server DNS</h2>
        {servers.map((s) => (
          <ServerDnsRow key={s.id} server={s} onSave={applyDnsOne} />
        ))}
        {!servers.length && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No stream servers — add one under Servers.
          </p>
        )}
      </section>

      <div className="grid gap-3">
        <button
          type="button"
          onClick={flushCache}
          className="rounded-lg border p-4 text-left cursor-pointer hover:opacity-90"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <div className="font-medium">Flush stream cache</div>
          <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Clears Xtream categories and EPG cache
          </div>
        </button>
        <Link
          href="/admin/management/stream-providers"
          className="rounded-lg border p-4 block hover:opacity-90"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <div className="font-medium">Stream providers →</div>
        </Link>
        <Link
          href="/admin/servers"
          className="rounded-lg border p-4 block hover:opacity-90"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <div className="font-medium">Stream servers →</div>
        </Link>
      </div>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}

function ServerDnsRow({
  server,
  onSave,
}: {
  server: ServerRow;
  onSave: (id: string, hosts: string, mode: "round_robin" | "random") => void;
}) {
  const [hosts, setHosts] = useState(server.dnsRotator?.hosts?.join("\n") ?? "");
  const [mode, setMode] = useState<"round_robin" | "random">(
    server.dnsRotator?.mode === "random" ? "random" : "round_robin"
  );

  return (
    <div
      className="rounded-lg border p-3 space-y-2"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div className="text-sm font-medium">
        {server.name}{" "}
        <IpWithFlag ip={server.host} className="font-normal" />
      </div>
      <select
        className="rounded border px-2 py-1 bg-transparent text-xs"
        style={{ borderColor: "var(--border)" }}
        value={mode}
        onChange={(e) => setMode(e.target.value as "round_robin" | "random")}
      >
        <option value="round_robin">Round robin</option>
        <option value="random">Random</option>
      </select>
      <textarea
        className="w-full rounded border px-2 py-1 bg-transparent font-mono text-xs"
        style={{ borderColor: "var(--border)" }}
        rows={2}
        value={hosts}
        onChange={(e) => setHosts(e.target.value)}
      />
      <button
        type="button"
        onClick={() => onSave(server.id, hosts, mode)}
        className="text-xs rounded px-3 py-1 border cursor-pointer"
        style={{ borderColor: "var(--border)" }}
      >
        Save server DNS
      </button>
    </div>
  );
}
