"use client";

import { useCallback, useEffect, useState } from "react";

export function ServerAgentPanel({ serverId }: { serverId: string }) {
  const [info, setInfo] = useState<{
    agentLastSeen: string | null;
    agentVersion: string | null;
    configRevision: number;
    agentToken: string | null;
  } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ssh, setSsh] = useState({
    agentSshHost: "",
    agentSshPort: 22,
    agentSshUser: "root",
    agentUseSsh: false,
  });
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`/api/admin/servers/${serverId}/agent`)
      .then((r) => r.json())
      .then((d) => setInfo(d.server));
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(action: string, extra?: Record<string, unknown>) {
    setMsg("");
    const res = await fetch(`/api/admin/servers/${serverId}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const j = await res.json();
    if (!res.ok) {
      setMsg(j.error ?? "Failed");
      return;
    }
    if (j.agentToken) setToken(j.agentToken);
    setMsg(action === "generate_token" ? "Token generated — copy now." : "OK");
    load();
  }

  return (
    <div
      className="rounded-lg border p-4 space-y-3 text-sm"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <h3 className="font-medium">Stream server agent</h3>
      <p style={{ color: "var(--muted)" }}>
        Install <code className="font-mono text-xs">scripts/nexlify-stream-agent.sh</code> on the
        stream node. It polls the panel for nginx/ffmpeg config and process commands.
      </p>
      {info && (
        <ul className="text-xs space-y-1" style={{ color: "var(--muted)" }}>
          <li>Config revision: {info.configRevision}</li>
          <li>
            Last seen:{" "}
            {info.agentLastSeen ? new Date(info.agentLastSeen).toLocaleString() : "Never"}
          </li>
          <li>Agent version: {info.agentVersion ?? "—"}</li>
          <li>Token: {info.agentToken ? "Configured" : "Not set"}</li>
        </ul>
      )}
      {token && (
        <textarea
          readOnly
          className="w-full font-mono text-xs rounded border p-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          rows={2}
          value={token}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded px-3 py-1.5 text-xs border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
          onClick={() => act("generate_token")}
        >
          Generate token
        </button>
        <button
          type="button"
          className="rounded px-3 py-1.5 text-xs border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
          onClick={() => act("apply_config")}
        >
          Push config
        </button>
        <button
          type="button"
          className="rounded px-3 py-1.5 text-xs border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
          onClick={() => act("nginx_reload")}
        >
          Reload nginx
        </button>
        <button
          type="button"
          className="rounded px-3 py-1.5 text-xs border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
          onClick={() => act("clear_cache")}
        >
          Clear cache
        </button>
        <button
          type="button"
          className="rounded px-3 py-1.5 text-xs border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
          onClick={() => act("reboot_server")}
        >
          Reboot server
        </button>
        <button
          type="button"
          className="rounded px-3 py-1.5 text-xs border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
          onClick={() => act("rotate_token")}
        >
          Rotate token
        </button>
        <button
          type="button"
          className="rounded px-3 py-1.5 text-xs cursor-pointer"
          style={{ color: "var(--danger)" }}
          onClick={() => act("revoke_token")}
        >
          Revoke token
        </button>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer" style={{ color: "var(--accent)" }}>
          Install agent (systemd)
        </summary>
        <pre
          className="mt-2 p-2 rounded overflow-x-auto font-mono text-[10px]"
          style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
        >{`[Service]
Environment=PANEL_URL=${typeof window !== "undefined" ? window.location.origin : "https://panel.example.com"}
Environment=AGENT_TOKEN=<paste after Generate token>
Environment=NGINX_RELOAD_CMD=/home/nexlify/bin/nginx/sbin/nginx -s reload
ExecStart=/opt/nexlify-stream-agent.sh
Restart=always

# Copy scripts/nexlify-stream-agent.sh to /opt/ and chmod +x
# systemctl enable --now nexlify-agent`}</pre>
      </details>
      <div className="grid md:grid-cols-3 gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
        <input
          placeholder="SSH host"
          className="rounded border px-2 py-1 bg-transparent text-xs"
          style={{ borderColor: "var(--border)" }}
          value={ssh.agentSshHost}
          onChange={(e) => setSsh({ ...ssh, agentSshHost: e.target.value })}
        />
        <input
          type="number"
          placeholder="SSH port"
          className="rounded border px-2 py-1 bg-transparent text-xs"
          style={{ borderColor: "var(--border)" }}
          value={ssh.agentSshPort}
          onChange={(e) => setSsh({ ...ssh, agentSshPort: parseInt(e.target.value, 10) })}
        />
        <input
          placeholder="SSH user"
          className="rounded border px-2 py-1 bg-transparent text-xs"
          style={{ borderColor: "var(--border)" }}
          value={ssh.agentSshUser}
          onChange={(e) => setSsh({ ...ssh, agentSshUser: e.target.value })}
        />
        <label className="flex items-center gap-2 text-xs md:col-span-3">
          <input
            type="checkbox"
            checked={ssh.agentUseSsh}
            onChange={(e) => setSsh({ ...ssh, agentUseSsh: e.target.checked })}
          />
          Enable SSH assist (optional — agent HTTP is primary)
        </label>
        <button
          type="button"
          className="rounded px-3 py-1.5 text-xs border cursor-pointer md:col-span-3"
          style={{ borderColor: "var(--border)" }}
          onClick={() => act("save_ssh", ssh)}
        >
          Save SSH settings
        </button>
      </div>
      {msg && <p className="text-xs">{msg}</p>}
    </div>
  );
}
