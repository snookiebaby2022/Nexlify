"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { InstallProgressBar } from "@/components/install-progress-bar";

export default function ServerInstallWizardPage() {
  const [panelUrl, setPanelUrl] = useState("");
  const [host, setHost] = useState("");
  const [serverName, setServerName] = useState("Stream-1");
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [out, setOut] = useState<{
    installCommand?: string;
    agentToken?: string;
    steps?: string[];
  } | null>(null);
  const [running, setRunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setPanelUrl(window.location.origin);
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPoll(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/admin/servers/install-job?jobId=${encodeURIComponent(id)}`);
      const j = await res.json();
      if (!res.ok) return;
      setProgress(j.progress ?? 0);
      setStep(j.step ?? "");
      if (j.error) setError(j.error);
      if (j.done) {
        if (pollRef.current) clearInterval(pollRef.current);
        setRunning(false);
        if (j.result) setOut(j.result as typeof out);
        if (!j.error) setProgress(100);
      }
    }, 350);
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError("");
    setOut(null);
    setProgress(0);
    setStep("Starting…");

    const res = await fetch("/api/admin/servers/install-job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ panelUrl, host, serverName }),
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

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/admin/servers" className="text-sm link-back">
        ← Servers
      </Link>
      <h1 className="text-2xl font-semibold">Server install wizard</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Generates a one-line bootstrap for FFmpeg, nginx, and the Nexlify stream agent (Agent v2).
      </p>

      {(running || jobId) && (
        <InstallProgressBar progress={progress} step={step} error={error || undefined} />
      )}

      <form onSubmit={generate} className="space-y-3 text-sm">
        <label className="block">
          Panel URL
          <input
            className="panel-select mt-1 w-full rounded border px-3 py-2"
            style={{ borderColor: "var(--border)" }}
            value={panelUrl}
            onChange={(e) => setPanelUrl(e.target.value)}
          />
        </label>
        <label className="block">
          Stream server hostname / IP
          <input
            className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="203.0.113.10"
          />
        </label>
        <label className="block">
          Server name (for panel)
          <input
            className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={running}
          className="btn-positive rounded px-4 py-2 font-medium disabled:opacity-50"
        >
          {running ? "Preparing install…" : "Generate install command"}
        </button>
      </form>

      {out?.steps && (
        <ol className="text-sm list-decimal list-inside space-y-1" style={{ color: "var(--muted)" }}>
          {out.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
      {out?.installCommand && (
        <pre
          className="text-xs p-3 rounded whitespace-pre-wrap break-all"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          {out.installCommand}
        </pre>
      )}
      {out?.agentToken && (
        <p className="text-sm">
          Agent token (paste when adding server):{" "}
          <code className="text-xs font-mono">{out.agentToken}</code>
        </p>
      )}
    </div>
  );
}
