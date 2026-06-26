"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function CdnIpsSettingsPage() {
  const [cf4, setCf4] = useState<string[]>([]);
  const [cf6, setCf6] = useState<string[]>([]);
  const [bunny, setBunny] = useState<string[]>([]);
  const [nginx, setNginx] = useState("");
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [syncing, setSyncing] = useState(false);

  function load() {
    fetch("/api/admin/cdn-ips")
      .then((r) => r.json())
      .then((d) => {
        setCf4(d.cloudflareIpv4 ?? []);
        setCf6(d.cloudflareIpv6 ?? []);
        setBunny(d.bunnyIpv4 ?? []);
        setNginx(d.nginxSnippet ?? "");
        setSyncedAt(d.syncedAt ?? null);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function sync() {
    setSyncing(true);
    setMsg("");
    const res = await fetch("/api/admin/cdn-ips", { method: "POST" });
    const data = await res.json();
    setSyncing(false);
    if (!res.ok) {
      setMsg(data.error ?? "Sync failed");
      return;
    }
    setMsg(`Synced ${data.counts.cloudflareV4} CF IPv4, ${data.counts.cloudflareV6} CF IPv6, ${data.counts.bunny} Bunny.`);
    load();
  }

  function copySnippet() {
    void navigator.clipboard.writeText(nginx);
    setMsg("Nginx snippet copied.");
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/admin/settings/security" className="text-sm link-back">
        ← Security
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Cloudflare & Bunny IPs</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Official CDN edge ranges for nginx <code className="font-mono text-xs">set_real_ip_from</code> and
          trusted proxy client IP in the panel.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-positive rounded px-4 py-2 text-sm cursor-pointer disabled:opacity-60"
          disabled={syncing}
          onClick={sync}
        >
          {syncing ? "Syncing…" : "Sync from Cloudflare & Bunny"}
        </button>
        <button
          type="button"
          className="rounded px-4 py-2 text-sm border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
          onClick={copySnippet}
        >
          Copy nginx snippet
        </button>
      </div>
      {syncedAt && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Last sync: {new Date(syncedAt).toLocaleString()}
        </p>
      )}
      {msg && <p className="text-sm">{msg}</p>}

      <div className="grid md:grid-cols-2 gap-4">
        <IpListCard title="Cloudflare IPv4" count={cf4.length} items={cf4.slice(0, 40)} more={cf4.length - 40} />
        <IpListCard title="Bunny IPv4" count={bunny.length} items={bunny} />
      </div>
      {cf6.length > 0 && (
        <IpListCard title="Cloudflare IPv6" count={cf6.length} items={cf6.slice(0, 20)} more={cf6.length - 20} />
      )}

      <label className="block text-sm">
        <span className="font-medium">Nginx real IP block</span>
        <textarea
          readOnly
          className="mt-2 w-full min-h-[200px] font-mono text-xs rounded border p-3 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={nginx}
        />
      </label>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Paste into your nginx <code className="font-mono">http</code> block before location rules. Enable
        &quot;Trust Cloudflare IP&quot; under Security so the panel uses CF-Connecting-IP when the request
        comes from these ranges.
      </p>
    </div>
  );
}

function IpListCard({
  title,
  count,
  items,
  more,
}: {
  title: string;
  count: number;
  items: string[];
  more?: number;
}) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
      <h2 className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
        {title} ({count})
      </h2>
      <ul className="mt-2 font-mono text-xs space-y-0.5 max-h-48 overflow-y-auto" style={{ color: "var(--muted)" }}>
        {items.map((ip) => (
          <li key={ip}>{ip}</li>
        ))}
        {more != null && more > 0 && <li>… +{more} more</li>}
      </ul>
    </div>
  );
}
