"use client";

import { useCallback, useEffect, useState } from "react";

/** IPTV edge proxy env vars for LB-local auth (XUI-style loopback live-auth). */
export function ServerEdgeAuthPanel({
  serverId,
  serverName,
}: {
  serverId: string;
  serverName: string;
}) {
  const [agentToken, setAgentToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/servers/${serverId}/agent`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const configured = Boolean(d.server?.agentToken);
        setAgentToken(configured ? "configured" : null);
      })
      .catch(() => setAgentToken(null))
      .finally(() => setLoading(false));
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  async function generateToken() {
    const res = await fetch(`/api/admin/servers/${serverId}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate_token" }),
    });
    const j = await res.json();
    if (j.agentToken) setAgentToken(j.agentToken);
    load();
  }

  const envBlock = agentToken && agentToken !== "configured"
    ? `IPTV_EDGE_AGENT_TOKEN=${agentToken}
IPTV_EDGE_SERVER_ID=${serverId}`
    : agentToken === "configured"
      ? `IPTV_EDGE_AGENT_TOKEN=<generate or rotate in Agent panel below>
IPTV_EDGE_SERVER_ID=${serverId}`
      : null;

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div
      className="rounded-lg border p-4 space-y-3 text-sm"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div>
        <h3 className="font-medium">LB-local auth (IPTV edge)</h3>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          On stream node <strong>{serverName}</strong>, set these in the systemd unit for{" "}
          <code className="font-mono">iptv-edge-proxy</code>. The edge calls panel live-auth with
          the agent token instead of the internal secret — faster zap and scoped to this server.
        </p>
      </div>
      {loading ? (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Loading agent token…
        </p>
      ) : (
        <>
          <pre
            className="text-xs font-mono p-3 rounded overflow-x-auto"
            style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
          >
            {envBlock ?? "Generate an agent token first (section below)."}
          </pre>
          <div className="flex flex-wrap gap-2">
            {envBlock ? (
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded border cursor-pointer"
                style={{ borderColor: "var(--border)" }}
                onClick={() => copy(envBlock, "env")}
              >
                {copied === "env" ? "Copied" : "Copy env block"}
              </button>
            ) : null}
            <button
              type="button"
              className="text-xs px-3 py-1.5 rounded cursor-pointer"
              style={{ background: "var(--accent)", color: "#fff" }}
              onClick={() => generateToken()}
            >
              Generate agent token
            </button>
          </div>
        </>
      )}
    </div>
  );
}
