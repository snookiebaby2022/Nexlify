"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";

type MonitorTab = "resources" | "network" | "connections";

export default function ServerInstallWizardPage() {
  const [panelUrl, setPanelUrl] = useState("");
  const [serverName, setServerName] = useState("Main Server");
  const [host, setHost] = useState("");
  const [sshPort, setSshPort] = useState("22");
  const [sshUser, setSshUser] = useState("root");
  const [sshPassword, setSshPassword] = useState("");
  const [updateSysctl, setUpdateSysctl] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [out, setOut] = useState<{ installCommand?: string; agentToken?: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [monitorTab, setMonitorTab] = useState<MonitorTab>("resources");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPanelUrl(window.location.origin);
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs]);

  function startPoll(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/admin/servers/install-job?jobId=${encodeURIComponent(id)}`);
      const j = await res.json();
      if (!res.ok) return;
      setProgress(j.progress ?? 0);
      setStep(j.step ?? "");
      if (Array.isArray(j.logs)) setLogs(j.logs);
      if (j.error) setError(j.error);
      if (j.done) {
        if (pollRef.current) clearInterval(pollRef.current);
        setRunning(false);
        if (j.result) setOut(j.result as typeof out);
        if (!j.error) setProgress(100);
      }
    }, 350);
  }

  async function install(e: React.FormEvent) {
    e.preventDefault();
    if (!host.trim()) {
      setError("Server IP is required.");
      return;
    }
    setRunning(true);
    setError("");
    setOut(null);
    setLogs([]);
    setProgress(0);
    setStep("Installing…");

    const res = await fetch("/api/admin/servers/install-job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        panelUrl,
        host: host.trim(),
        serverName: serverName.trim(),
        sshPort,
        sshUser,
        updateSysctl,
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      setError(j.error ?? "Failed to start install");
      setRunning(false);
      return;
    }
    setJobId(j.jobId);
    startPoll(j.jobId);
  }

  const showProgress = running || jobId;

  return (
    <div className="xui-install-page space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Server Installation</h1>
        <Link href="/admin/servers" className="btn-positive rounded px-4 py-2 text-sm font-medium">
          Manage Servers
        </Link>
      </div>

      {showProgress && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold">{serverName || "Server"}</span>
              {host && (
                <span className="text-sm ml-2 font-mono" style={{ color: "var(--muted)" }}>
                  {host}
                </span>
              )}
            </div>
            {running && (
              <span className="text-xs px-2 py-1 rounded" style={{ background: "rgba(0,192,239,0.15)", color: "#7dd3fc" }}>
                {step || "Installing…"} ({progress}%)
              </span>
            )}
          </div>

          <div className="xui-install-stat-row">
            <div className="xui-install-stat xui-install-stat--purple">
              <div className="text-2xl font-bold">0</div>
              <div className="text-xs opacity-90">Connections</div>
            </div>
            <div className="xui-install-stat xui-install-stat--green">
              <div className="text-2xl font-bold">0</div>
              <div className="text-xs opacity-90">Users</div>
            </div>
            <div className="xui-install-stat xui-install-stat--pink">
              <div className="text-2xl font-bold">0</div>
              <div className="text-xs opacity-90">Streams</div>
            </div>
            <div className="xui-install-stat xui-install-stat--teal">
              <div className="text-2xl font-bold">0</div>
              <div className="text-xs opacity-90">Down</div>
            </div>
          </div>

          <div
            className="rounded-lg border p-6 text-center"
            style={{ borderColor: "rgba(0,192,239,0.35)", background: "rgba(0,192,239,0.08)" }}
          >
            <Sparkles className="mx-auto mb-2 opacity-80" size={28} style={{ color: "#7dd3fc" }} />
            <p className="font-semibold mb-3">{running ? "Installing…" : error ? "Install failed" : "Install ready"}</p>
            <div ref={logRef} className="xui-install-log text-left">
              {logs.length ? logs.join("\n") : "Waiting for install log…"}
            </div>
            {error && <p className="text-sm mt-3 text-red-400">{error}</p>}
            {out?.installCommand && !running && (
              <pre className="xui-install-log text-left mt-3">{out.installCommand}</pre>
            )}
            {out?.agentToken && !running && (
              <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
                Agent token: <code className="font-mono">{out.agentToken}</code>
              </p>
            )}
          </div>

          <nav className="xui-install-monitor-tabs" aria-label="Server monitor">
            {(
              [
                { id: "resources" as const, label: "Resources" },
                { id: "network" as const, label: "Network Traffic" },
                { id: "connections" as const, label: "Active Connections" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                className={`xui-install-monitor-tab ${monitorTab === t.id ? "xui-install-monitor-tab--active" : ""}`}
                onClick={() => setMonitorTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div
            className="rounded-lg border p-8 text-center text-sm min-h-[120px]"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            {running
              ? "Metrics will appear here once the server agent is online."
              : monitorTab === "resources"
                ? "CPU, memory, and disk charts populate after the agent connects."
                : monitorTab === "network"
                  ? "Network throughput graphs appear when the node is streaming."
                  : "Active viewer connections list here after go-live."}
          </div>
        </>
      )}

      <div className="xui-install-card">
        <div className="xui-install-card-header">
          <Sparkles size={16} />
          Details
        </div>
        <form onSubmit={install} className="xui-install-body">
          <div className="space-y-4">
            <div className="xui-install-field">
              <label htmlFor="serverName">Server Name</label>
              <input
                id="serverName"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                placeholder="Main Server"
              />
            </div>
            <div className="xui-install-grid">
              <div className="xui-install-field">
                <label htmlFor="host">Server IP</label>
                <input
                  id="host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="192.168.1.10"
                  required
                />
              </div>
              <div className="xui-install-field">
                <label htmlFor="sshPort">SSH Port</label>
                <input
                  id="sshPort"
                  value={sshPort}
                  onChange={(e) => setSshPort(e.target.value)}
                  placeholder="22"
                />
              </div>
            </div>
            <div className="xui-install-grid">
              <div className="xui-install-field">
                <label htmlFor="sshUser">SSH Username</label>
                <input
                  id="sshUser"
                  value={sshUser}
                  onChange={(e) => setSshUser(e.target.value)}
                  placeholder="root"
                />
              </div>
              <div className="xui-install-field">
                <label htmlFor="sshPassword">SSH Password</label>
                <input
                  id="sshPassword"
                  type="password"
                  value={sshPassword}
                  onChange={(e) => setSshPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={updateSysctl}
                onChange={(e) => setUpdateSysctl(e.target.checked)}
              />
              Update sysctl.conf (high connection limits)
            </label>
          </div>

          <div className="xui-install-note">
            Installation will begin immediately; progress appears above. After installation completes you can
            amend ports and other server settings in Manage Servers.
            {updateSysctl && (
              <>
                {" "}
                With new installations, the file limit is set in the system. A reboot is required for this, but
                you can do it at your own pace.
              </>
            )}
          </div>

          <div className="flex justify-end mt-5">
            <button
              type="submit"
              disabled={running}
              className="btn-positive rounded px-6 py-2.5 font-medium disabled:opacity-50"
            >
              {running ? "Installing…" : "Install Server"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
