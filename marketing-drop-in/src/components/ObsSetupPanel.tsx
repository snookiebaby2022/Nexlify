"use client";

import { useState } from "react";

type ObsSetupPanelProps = {
  rtmpServer: string;
  streamKey: string | null;
};

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-violet-400/40 hover:text-white"
    >
      {copied ? "Copied" : `Copy ${label}`}
    </button>
  );
}

export function ObsSetupPanel({ rtmpServer, streamKey }: ObsSetupPanelProps) {
  const [showKey, setShowKey] = useState(false);

  return (
    <section className="glass rounded-2xl p-6 md:p-8">
      <h2 className="font-display text-xl font-semibold text-white">Broadcast with OBS Studio</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Use these settings in OBS → Settings → Stream. Choose <strong className="text-slate-200">Custom</strong>{" "}
        as the service.
      </p>

      <dl className="mt-6 space-y-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-violet-300">Server</dt>
          <dd className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <code className="break-all font-mono text-sm text-white">{rtmpServer}</code>
            <CopyButton value={rtmpServer} label="server" />
          </dd>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-violet-300">Stream key</dt>
          <dd className="mt-2 flex flex-wrap items-center justify-between gap-3">
            {streamKey ? (
              <>
                <code className="break-all font-mono text-sm text-white">
                  {showKey ? streamKey : "••••••••••••••••"}
                </code>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-violet-400/40 hover:text-white"
                  >
                    {showKey ? "Hide" : "Reveal"}
                  </button>
                  {showKey && <CopyButton value={streamKey} label="key" />}
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                Set <code className="text-violet-300">LIVESTREAM_STREAM_KEY</code> in your server environment.
              </p>
            )}
          </dd>
        </div>
      </dl>

      <ol className="mt-6 space-y-3 text-sm text-[var(--muted)]">
        <li>
          <span className="font-semibold text-slate-200">1.</span> Open OBS Studio → Settings → Stream.
        </li>
        <li>
          <span className="font-semibold text-slate-200">2.</span> Service: <strong className="text-slate-200">Custom</strong>.
          Paste the server and stream key above.
        </li>
        <li>
          <span className="font-semibold text-slate-200">3.</span> Output → set video to 1920×1080 or 1280×720, encoder{" "}
          <strong className="text-slate-200">x264</strong> or <strong className="text-slate-200">NVENC</strong>, bitrate
          2500–6000 kbps.
        </li>
        <li>
          <span className="font-semibold text-slate-200">4.</span> Click <strong className="text-slate-200">Start Streaming</strong>.
          This page will detect the broadcast within a few seconds.
        </li>
      </ol>
    </section>
  );
}
