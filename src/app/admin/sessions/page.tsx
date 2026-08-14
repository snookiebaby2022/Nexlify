"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Users, Shield, Settings } from "lucide-react";

type SessionInfo = {
  lineId: string;
  streamId: string;
  ip: string;
  userAgent: string;
  deviceId: string | null;
  startedAt: number;
  lastHeartbeat: number;
};

type SessionPolicy = {
  maxConnections: number;
  maxDevices: number;
  allowIpChange: boolean;
  ipChangeWindowSec: number;
  deviceBindMode: string;
  enforceConcurrentStreams: boolean;
};

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [policy, setPolicy] = useState<SessionPolicy | null>(null);
  const [lineId, setLineId] = useState("");
  const [loading, setLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      if (lineId) {
        const [sessionsRes, policyRes] = await Promise.all([
          fetch(`/api/admin/sessions?action=sessions&lineId=${encodeURIComponent(lineId)}`),
          fetch(`/api/admin/sessions?action=policy&lineId=${encodeURIComponent(lineId)}`),
        ]);
        if (sessionsRes.ok) {
          const data = await sessionsRes.json();
          setSessions(Array.isArray(data) ? data : data.sessions ?? []);
        }
        if (policyRes.ok) setPolicy(await policyRes.json());
      } else {
        const res = await fetch("/api/admin/connections");
        const data = await res.json().catch(() => ({}));
        const conns = Array.isArray(data.connections) ? data.connections : [];
        setSessions(
          conns.map((c: { line?: { id?: string }; stream?: { id?: string }; ip?: string; userAgent?: string; startedAt?: string; lastSeenAt?: string }) => ({
            lineId: c.line?.id ?? "",
            streamId: c.stream?.id ?? "",
            ip: c.ip ?? "",
            userAgent: c.userAgent ?? "",
            deviceId: null,
            startedAt: c.startedAt ? new Date(c.startedAt).getTime() : Date.now(),
            lastHeartbeat: c.lastSeenAt ? new Date(c.lastSeenAt).getTime() : Date.now(),
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, [lineId]);

  useEffect(() => {
    void loadSessions();
    const t = setInterval(() => void loadSessions(), 15000);
    return () => clearInterval(t);
  }, [loadSessions]);

  const cleanup = async () => {
    if (!lineId) return;
    await fetch("/api/admin/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cleanup", lineId }),
    });
    loadSessions();
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Session Management</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Monitor and control active streaming sessions
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <input
          placeholder="Enter Line ID"
          value={lineId}
          onChange={(e) => setLineId(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg border bg-transparent text-sm"
          style={{ borderColor: "var(--border)" }}
        />
        <button onClick={loadSessions} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "var(--accent)" }}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Load
        </button>
        <button onClick={cleanup} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border" style={{ borderColor: "var(--border)" }}>
          Cleanup Stale
        </button>
      </div>

      {policy && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Shield size={16} style={{ color: "var(--accent)" }} />
            <span className="text-sm font-semibold">Session Policy</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><span style={{ color: "var(--muted)" }}>Max Connections:</span> <span className="font-semibold">{policy.maxConnections}</span></div>
            <div><span style={{ color: "var(--muted)" }}>Max Devices:</span> <span className="font-semibold">{policy.maxDevices}</span></div>
            <div><span style={{ color: "var(--muted)" }}>IP Change:</span> <span className="font-semibold">{policy.allowIpChange ? "Allowed" : "Blocked"}</span></div>
            <div><span style={{ color: "var(--muted)" }}>IP Window:</span> <span className="font-semibold">{policy.ipChangeWindowSec}s</span></div>
            <div><span style={{ color: "var(--muted)" }}>Device Bind:</span> <span className="font-semibold">{policy.deviceBindMode}</span></div>
            <div><span style={{ color: "var(--muted)" }}>Concurrent:</span> <span className="font-semibold">{policy.enforceConcurrentStreams ? "Enforced" : "Flexible"}</span></div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {sessions.map((session, i) => (
          <div key={i} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Users size={14} style={{ color: "var(--accent)" }} />
                  <span className="text-sm font-semibold">Session {i + 1}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                  <div><span style={{ color: "var(--muted)" }}>IP:</span> <span className="font-mono">{session.ip}</span></div>
                  <div><span style={{ color: "var(--muted)" }}>Stream:</span> {session.streamId}</div>
                  <div><span style={{ color: "var(--muted)" }}>Started:</span> {new Date(session.startedAt).toLocaleString()}</div>
                  <div><span style={{ color: "var(--muted)" }}>Last Heartbeat:</span> {new Date(session.lastHeartbeat).toLocaleString()}</div>
                  {session.deviceId && <div><span style={{ color: "var(--muted)" }}>Device:</span> {session.deviceId}</div>}
                </div>
              </div>
            </div>
          </div>
        ))}
        {lineId && sessions.length === 0 && <p className="text-center py-8 text-sm" style={{ color: "var(--muted)" }}>No active sessions</p>}
      </div>
    </div>
  );
}
