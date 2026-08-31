"use client";

import { useEffect, useState } from "react";
import { Copy, Check, RefreshCw } from "lucide-react";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

type ApiCredentials = {
  apiKey: string | null;
  hasApiKey: boolean;
  baseUrl: string;
  panelApiUrl: string;
  example: string | null;
  showStreaming?: boolean;
  streaming: {
    playerApi: string;
    playlist: string;
    liveStream: string;
    stalkerPortal: string;
    magPortal: string;
  };
  allowedActions: string[];
  note: string;
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div>
      <p className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <div
        className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-mono break-all"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <span className="flex-1">{value}</span>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 p-1 rounded hover:opacity-80"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

export function ResellerApiInfoPage({ showStreaming = true }: { showStreaming?: boolean }) {
  const [info, setInfo] = useState<ApiCredentials | null>(null);
  const [error, setError] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  async function load() {
    const r = await fetch("/api/reseller/api-credentials");
    if (!r.ok) throw new Error("load");
    return r.json() as Promise<ApiCredentials>;
  }

  useEffect(() => {
    load()
      .then(setInfo)
      .catch(() => setError("Could not load API credentials."));
  }, []);

  async function regenerateKey() {
    if (!confirm("Generate a new API key? Existing integrations using the old key will stop working.")) {
      return;
    }
    setRegenerating(true);
    setError("");
    try {
      const r = await fetch("/api/reseller/api-credentials", { method: "POST" });
      if (!r.ok) throw new Error("regenerate");
      await load().then(setInfo);
    } catch {
      setError("Could not regenerate API key.");
    } finally {
      setRegenerating(false);
    }
  }

  const streamingEnabled = showStreaming && info?.showStreaming !== false;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">API &amp; streaming URLs</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Automate line management with your panel API key
          {streamingEnabled ? ", or share Xtream-compatible streaming URLs with customers" : ""}.
        </p>
      </div>
      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {info && (
        <>
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-medium">Panel API (automation)</h2>
              <button
                type="button"
                onClick={regenerateKey}
                disabled={regenerating}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border"
                style={{ borderColor: "var(--border)" }}
              >
                <RefreshCw size={14} className={regenerating ? "animate-spin" : ""} />
                {info.hasApiKey ? "Regenerate key" : "Generate key"}
              </button>
            </div>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {info.note}
            </p>
            <CopyField label="API base URL" value={info.panelApiUrl} />
            {info.apiKey ? (
              <CopyField label="API key" value={info.apiKey} />
            ) : (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No API key yet — click Generate key to create one.
              </p>
            )}
            {info.example && <CopyField label="Example request" value={info.example} />}
          </section>

          {streamingEnabled ? (
            <section className="space-y-4">
              <h2 className="text-lg font-medium">Streaming API (Xtream / M3U)</h2>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Use each line&apos;s username and password — not your panel login.
                {info.baseUrl !== info.panelApiUrl.replace(/\/api\/v1$/, "") ? (
                  <> Custom DNS: <span className="font-mono">{info.baseUrl}</span>.</>
                ) : null}
              </p>
              <CopyField label="Panel / stream host" value={info.baseUrl} />
              <CopyField label="Player API" value={info.streaming.playerApi} />
              <CopyField label="M3U playlist" value={info.streaming.playlist} />
              <CopyField label="Live stream URL" value={info.streaming.liveStream} />
              <CopyField label="MAG / Stalker portal" value={info.streaming.stalkerPortal} />
            </section>
          ) : (
            <p className="text-sm rounded-lg border px-4 py-3" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
              Streaming API URLs are disabled for your group. Ask your administrator to enable{" "}
              <strong>Show Streaming API</strong> and turn off <strong>Hide all URLs</strong> on your user group.
            </p>
          )}
        </>
      )}
    </div>
  );
}
