"use client";

import { useCallback, useEffect, useState } from "react";

type DeployStatus = {
  sitePath: string;
  pkgVersion: string;
  releasesVersion: string;
  git: { branch: string; log: string; dirtyFiles: number };
  pm2: { name: string; status: string; pid: number; uptime: number; restarts: number } | null;
};

type DeployStep = { name: string; output: string; ok: boolean };

type DeployResult = {
  ok: boolean;
  message: string;
  steps?: DeployStep[];
};

export function AdminDeploy() {
  const [status, setStatus] = useState<DeployStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState<DeployResult | null>(null);

  const loadStatus = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/deploy")
      .then((r) => r.json())
      .then(setStatus)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const deploy = useCallback(async () => {
    if (!confirm("Pull latest code, rebuild, and restart the marketing website?")) return;
    setDeploying(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-marketing" }),
      });
      const data = await res.json();
      setResult(data);
      loadStatus();
    } catch {
      setResult({ ok: false, message: "Request failed." });
    } finally {
      setDeploying(false);
    }
  }, [loadStatus]);

  if (loading) return <p className="text-slate-400 text-sm">Loading deploy status…</p>;
  if (!status) return <p className="text-red-400 text-sm">Failed to load status.</p>;

  return (
    <div className="space-y-8">
      <section className="glass rounded-2xl p-6">
        <h2 className="font-display text-xl font-semibold text-white">Marketing Website</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Pull latest code from git, rebuild, and restart PM2.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-[var(--muted)] text-xs">Package version</p>
            <p className="mt-1 text-white font-medium">v{status.pkgVersion || "—"}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-[var(--muted)] text-xs">Releases feed</p>
            <p className="mt-1 text-white font-medium">v{status.releasesVersion || "—"}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-[var(--muted)] text-xs">Git branch</p>
            <p className="mt-1 text-cyan-300 font-medium">{status.git.branch || "—"}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-[var(--muted)] text-xs">PM2 status</p>
            <p className="mt-1 font-medium">
              {status.pm2 ? (
                <span className={status.pm2.status === "online" ? "text-green-400" : "text-red-400"}>
                  {status.pm2.status} (restarts: {status.pm2.restarts})
                </span>
              ) : (
                <span className="text-slate-500">not found</span>
              )}
            </p>
          </div>
        </div>

        {status.git.dirtyFiles > 0 && (
          <p className="mt-3 text-xs text-amber-400">
            {status.git.dirtyFiles} uncommitted file(s) on server — deploy will pull latest from origin.
          </p>
        )}

        <button
          type="button"
          onClick={deploy}
          disabled={deploying}
          className="mt-5 rounded-lg bg-violet-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {deploying ? "Deploying…" : "Update Marketing Website"}
        </button>
      </section>

      {result && (
        <section className="glass rounded-2xl p-6">
          <h3 className={`font-display text-lg font-semibold ${result.ok ? "text-green-400" : "text-amber-400"}`}>
            {result.message}
          </h3>
          {result.steps?.length ? (
            <div className="mt-4 space-y-4">
              {result.steps.map((step, i) => (
                <div key={i} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <div className="flex items-center gap-2">
                    <span className={step.ok ? "text-green-400" : "text-red-400"}>
                      {step.ok ? "✓" : "✗"}
                    </span>
                    <span className="text-sm font-medium text-white">{step.name}</span>
                  </div>
                  {step.output && (
                    <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-slate-300 whitespace-pre-wrap">
                      {step.output}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      )}

      <section className="glass rounded-2xl p-6">
        <h3 className="font-display text-lg font-semibold text-white">Recent commits</h3>
        <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-slate-300">
          {status.git.log || "No git history"}
        </pre>
      </section>

      <section className="glass rounded-2xl p-6">
        <h3 className="font-display text-lg font-semibold text-white">How it works</h3>
        <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
          <li className="flex gap-2">
            <span className="text-violet-400 shrink-0">1.</span>
            <span>Push your code changes to <code className="text-cyan-300">origin main</code> from your local machine.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-violet-400 shrink-0">2.</span>
            <span>Click &quot;Update Marketing Website&quot; above to pull, build, and restart.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-violet-400 shrink-0">3.</span>
            <span>Customer panels auto-check <code className="text-cyan-300">https://nexlify.live/api/panel-releases</code> hourly and will see the new version.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-violet-400 shrink-0">4.</span>
            <span>Panel owners click &quot;Check for Updates&quot; in their admin to apply immediately.</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
