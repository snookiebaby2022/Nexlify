"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";

type StreamingInfo = {
  baseUrl: string;
  endpoints: {
    playerApi: string;
    playlist: string;
    liveStream: string;
    stalkerPortal: string;
  };
  note: string;
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
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

export function ResellerApiInfoPage() {
  const [info, setInfo] = useState<StreamingInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/reseller/streaming-info")
      .then((r) => {
        if (!r.ok) throw new Error("load");
        return r.json();
      })
      .then(setInfo)
      .catch(() => setError("Could not load streaming endpoints."));
  }, []);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Streaming API</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Xtream-compatible URLs for lines you manage. Use each line&apos;s username and password — not
          your panel login.
        </p>
      </div>
      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {info && (
        <div className="space-y-4">
          <CopyField label="Panel / stream host" value={info.baseUrl} />
          <CopyField label="Player API" value={info.endpoints.playerApi} />
          <CopyField label="M3U playlist" value={info.endpoints.playlist} />
          <CopyField label="Live stream URL" value={info.endpoints.liveStream} />
          <CopyField label="MAG / Stalker portal" value={info.endpoints.stalkerPortal} />
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {info.note}
          </p>
        </div>
      )}
    </div>
  );
}
