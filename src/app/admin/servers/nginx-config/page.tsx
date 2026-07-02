"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ServerNginxConfigPage() {
  const [config, setConfig] = useState("");
  const [panelUrl, setPanelUrl] = useState("");

  useEffect(() => {
    setPanelUrl(window.location.origin);
  }, []);

  useEffect(() => {
    const q = panelUrl ? `?panelUrl=${encodeURIComponent(panelUrl)}` : "";
    fetch(`/api/admin/servers/nginx-config${q}`)
      .then((r) => r.json())
      .then((d) => setConfig(d.config ?? ""));
  }, [panelUrl]);

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Recommended nginx config</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            RTMP/HLS edge template with Anti-Freeze (no live buffering), low-latency proxy, and HLS segment delivery.
          </p>
        </div>
        <Link href="/admin/servers" className="text-sm link-back">
          ← Servers
        </Link>
      </div>

      <div className="rounded-lg border p-4 text-sm space-y-2" style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.06)" }}>
        <p className="font-medium">Install checklist</p>
        <ol className="list-decimal pl-5 space-y-1" style={{ color: "var(--muted)" }}>
          <li>Run the one-click installer on each stream VPS (FFmpeg + nginx + agent).</li>
          <li>Ensure panel Redis is running — Fast Zap URL cache requires it.</li>
          <li>Copy <code className="text-xs">nginx/nexlify-stream-server.conf</code> from the repo or download below.</li>
          <li>Set <strong>proxy_buffering off</strong> on all <code>/live/</code> locations.</li>
          <li>Prefer HLS (<code>.m3u8</code>) for web players; MAG/Stalker can use MPEG-TS.</li>
          <li>Monitor <Link href="/admin/streaming/health" className="underline" style={{ color: "var(--accent)" }}>Stream Health</Link> daily.</li>
        </ol>
      </div>

      <label className="block text-sm">
        Panel URL (for upstream block)
        <input
          className="mt-1 w-full rounded border px-3 py-2 bg-transparent font-mono text-sm"
          style={{ borderColor: "var(--border)" }}
          value={panelUrl}
          onChange={(e) => setPanelUrl(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/admin/servers/nginx-config?download=1&panelUrl=${encodeURIComponent(panelUrl)}`}
          className="btn-positive rounded px-4 py-2 text-sm font-medium"
        >
          Download .conf
        </a>
        <button
          type="button"
          className="rounded px-4 py-2 text-sm border"
          style={{ borderColor: "var(--border)" }}
          onClick={() => navigator.clipboard.writeText(config)}
        >
          Copy to clipboard
        </button>
      </div>

      <pre
        className="text-xs p-4 rounded overflow-x-auto whitespace-pre-wrap border"
        style={{ borderColor: "var(--border)", background: "#0f172a", color: "#e2e8f0", maxHeight: "480px" }}
      >
        {config || "Loading…"}
      </pre>
    </div>
  );
}
