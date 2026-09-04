"use client";

import { useEffect, useState } from "react";
import { SettingsPanel, SettingsSaveBar } from "@/components/settings-panel";
import { CUSTOMER_FIREWALL_PORTS, STREAM_HTTP_PORT, STREAM_HTTPS_PORT } from "@/lib/server-ports";

export default function ServerSettingsPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings?group=server")
      .then((r) => r.json())
      .then((d) => setData(d.settings ?? {}));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: "server", settings: data }),
    });
    const j = await res.json();
    setSaving(false);
    setMsg(
      res.ok
        ? j.portSync?.ok === false
          ? `Saved. Port sync warning: ${j.portSync.message}`
          : "Server settings saved — nginx and firewall updated automatically."
        : j.error
    );
  }

  async function syncPorts() {
    setSyncing(true);
    setMsg("");
    const res = await fetch("/api/admin/server/ports/sync", { method: "POST" });
    const j = await res.json();
    setSyncing(false);
    setMsg(res.ok ? j.message : j.error ?? j.message ?? "Sync failed");
  }

  if (!data) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Loading…
      </p>
    );
  }

  const port = Number(data.panelPort ?? 3000);
  const sslPort = Number(data.panelSslPort ?? 443);
  const streamHttp = Number(data.streamHttpPort ?? STREAM_HTTP_PORT);
  const streamHttps = Number(data.streamHttpsPort ?? STREAM_HTTPS_PORT);

  return (
    <form onSubmit={save} className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-semibold">Server & port</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Publish HTTP :80 / :8080 for Xtream apps. HTTPS is optional extra DNS — MPEG-TS clients often stall on Cloudflare HTTPS.
        </p>
      </div>

      <SettingsPanel
        title="Playback topology"
        info="How this machine delivers /live/. Updates, rematch, and pm2-start follow this setting — they will not start a local iptv-edge or fuser :8080 on remote-splice / multi-lb."
      >
        <label className="block text-sm w-full">
          <span style={{ color: "var(--muted)" }}>This panel host</span>
          <select
            className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={String(data.playbackTopology ?? "local-edge")}
            onChange={(e) => setData({ ...data, playbackTopology: e.target.value })}
          >
            <option value="local-edge">A — Panel + local edge (owns :8080)</option>
            <option value="remote-splice">B — Panel only, nginx proxies /live/ to a remote splice</option>
            <option value="multi-lb">C — Multi-server LB (stream nodes splice; panel does not bind edge)</option>
          </select>
        </label>
        {String(data.playbackTopology ?? "") === "remote-splice" ? (
          <label className="block text-sm w-full mt-3">
            <span style={{ color: "var(--muted)" }}>Remote live upstream (host:port)</span>
            <input
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent font-mono text-sm"
              style={{ borderColor: "var(--border)" }}
              placeholder="209.237.141.15:8080"
              value={String(data.remoteLiveUpstream ?? "")}
              onChange={(e) => setData({ ...data, remoteLiveUpstream: e.target.value })}
            />
          </label>
        ) : null}
      </SettingsPanel>

      <SettingsPanel
        title="Panel URL"
        info="Primary public URL for the admin panel and Xtream API. Leave blank to use General → Panel URL."
      >
        <label className="block text-sm w-full">
          <span style={{ color: "var(--muted)" }}>Server URL</span>
          <input
            className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            placeholder="http://panel.example.com"
            value={String(data.serverUrl ?? "")}
            onChange={(e) => setData({ ...data, serverUrl: e.target.value })}
          />
        </label>
      </SettingsPanel>

      <SettingsPanel
        title="MAG & Enigma portal URLs"
        info="Shown on device pages. Enter these URLs on MAG / Enigma2 boxes (Portal URL field). Defaults to Server URL + /c/ when left blank."
      >
        <div className="grid gap-4 w-full">
          <label className="block text-sm">
            <span style={{ color: "var(--muted)" }}>MAG portal URL</span>
            <input
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent font-mono text-sm"
              style={{ borderColor: "var(--border)" }}
              placeholder="https://panel.example.com/c/"
              value={String(data.magServerUrl ?? "")}
              onChange={(e) => setData({ ...data, magServerUrl: e.target.value })}
            />
            <span className="mt-1 block text-xs" style={{ color: "var(--muted)" }}>
              MAG boxes use MAC address only — operators enter this portal URL on the STB.
            </span>
          </label>
          <label className="block text-sm">
            <span style={{ color: "var(--muted)" }}>Enigma2 portal URL</span>
            <input
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent font-mono text-sm"
              style={{ borderColor: "var(--border)" }}
              placeholder="https://panel.example.com/c/"
              value={String(data.enigmaServerUrl ?? "")}
              onChange={(e) => setData({ ...data, enigmaServerUrl: e.target.value })}
            />
            <span className="mt-1 block text-xs" style={{ color: "var(--muted)" }}>
              Enigma2 devices use MAC address only — same portal stack as MAG unless you set a separate URL.
            </span>
          </label>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Ports & firewall"
        info="Domain installs: panel on 443, Xtream/M3U on stream edge (8080). IP installs: everything on port 80. Saving applies nginx + UFW automatically."
      >
        <div className="grid md:grid-cols-2 gap-4 w-full">
          <label className="block text-sm">
            <span style={{ color: "var(--muted)" }}>Panel HTTP port</span>
            <input
              type="number"
              min={1}
              max={65535}
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={port}
              onChange={(e) => setData({ ...data, panelPort: Number(e.target.value) })}
            />
          </label>
          <label className="block text-sm">
            <span style={{ color: "var(--muted)" }}>Public HTTPS port</span>
            <input
              type="number"
              min={1}
              max={65535}
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={sslPort}
              onChange={(e) => setData({ ...data, panelSslPort: Number(e.target.value) })}
            />
          </label>
          <label className="block text-sm">
            <span style={{ color: "var(--muted)" }}>Stream edge HTTP port (Xtream / M3U / live)</span>
            <input
              type="number"
              min={1}
              max={65535}
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={streamHttp}
              onChange={(e) => setData({ ...data, streamHttpPort: Number(e.target.value) })}
            />
          </label>
          <label className="block text-sm">
            <span style={{ color: "var(--muted)" }}>Stream HTTPS port</span>
            <input
              type="number"
              min={1}
              max={65535}
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={streamHttps}
              onChange={(e) => setData({ ...data, streamHttpsPort: Number(e.target.value) })}
            />
          </label>
        </div>
        <div
          className="mt-4 rounded border p-3 text-xs space-y-1"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          <p className="font-medium text-sm" style={{ color: "var(--text)" }}>
            Firewall ports (UFW + cloud security group)
          </p>
          <p>
            {CUSTOMER_FIREWALL_PORTS.ssh} SSH · {CUSTOMER_FIREWALL_PORTS.http} HTTP ·{" "}
            {CUSTOMER_FIREWALL_PORTS.https} HTTPS · {streamHttp} stream edge ·{" "}
            {CUSTOMER_FIREWALL_PORTS.rtmp} RTMP · {CUSTOMER_FIREWALL_PORTS.rtsp} RTSP
          </p>
          <p>Internal only (never open publicly): 13000, 13001, 5432, 6379</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <button
            type="button"
            disabled={syncing}
            onClick={syncPorts}
            className="text-sm px-4 py-2 rounded-lg border font-medium disabled:opacity-50"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            {syncing ? "Syncing…" : "Sync ports & firewall"}
          </button>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Manual re-sync if needed (save already applies ports)
          </span>
        </div>
        <pre
          className="mt-4 text-xs rounded border p-3 overflow-x-auto"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >{`# Nginx — HTTPS :${sslPort} → panel :${port}
server {
  listen ${sslPort} ssl http2;
  server_name panel.example.com;
  location / {
    proxy_pass http://127.0.0.1:${port};
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

# Streaming edge (typical)
listen ${streamHttp};   # HTTP
listen ${streamHttps} ssl;  # HTTPS`}</pre>
        <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
          Set <code className="font-mono">PORT={port}</code>, <code className="font-mono">WEBSITE_PORT=3001</code>, and{" "}
          <code className="font-mono">STREAM_EDGE_PORT={streamHttp}</code> in <code className="font-mono">.env</code>, then restart PM2 / nginx.
        </p>
      </SettingsPanel>

      <div id="database-backup">
        <SettingsPanel
          title="Database backup"
          info="In-panel nexlify-cron writes gzipped SQL to backups/ under the panel install. Enable and schedule under Settings → Backup."
        >
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Scheduled database backups use the matching PostgreSQL client (not a raw DATABASE_URL on the shell).
            Optional system crontab:{" "}
            <code className="font-mono text-xs">0 4 * * * /home/nexlify/scripts/pg-dump-cron.sh</code>
            {" "}(also works at /home/nexlify-panel or /opt/nexlify-panel).
          </p>
        </SettingsPanel>
      </div>

      <SettingsPanel title="Stream agent upgrades">
        <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--muted)" }}>
          {String(
            data.streamAgentUpgradeNotes ??
              "Upgrade stream agents from Admin → Servers → action menu → Reinstall agent, or re-run the install wizard command on the node."
          )}
        </p>
      </SettingsPanel>

      <SettingsSaveBar saving={saving} msg={msg} />
    </form>
  );
}
