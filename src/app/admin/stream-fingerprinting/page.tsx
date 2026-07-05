"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Fingerprint, AlertTriangle } from "lucide-react";

type StreamFingerprint = {
  streamId: string;
  streamName: string;
  uniqueId: string;
  createdAt: number;
  isMarked: boolean;
};

type FingerprintMatch = {
  streamId: string;
  matchedStreamId: string;
  similarity: number;
  detectedAt: number;
};

export default function StreamFingerprintingPage() {
  const [fingerprints, setFingerprints] = useState<StreamFingerprint[]>([]);
  const [matches, setMatches] = useState<FingerprintMatch[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stream-fingerprint");
      const data = await res.json();
      setFingerprints(data.fingerprints ?? []);
      setMatches(data.matches ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const generate = async (streamId: string) => {
    setLoading(true);
    try {
      await fetch("/api/admin/stream-fingerprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", streamId }),
      });
      load();
    } finally {
      setLoading(false);
    }
  };

  const markPirated = async (streamId: string) => {
    setLoading(true);
    try {
      await fetch("/api/admin/stream-fingerprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_pirated", streamId }),
      });
      load();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Stream Fingerprinting</h1>
        <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {matches.length > 0 && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-red-400" />
            <h3 className="text-sm font-semibold">Potential Piracy Matches</h3>
          </div>
          <div className="space-y-2">
            {matches.map((m, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b" style={{ borderColor: "var(--border)" }}>
                <span className="text-sm font-mono">{m.streamId} → {m.matchedStreamId}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-red-900/30 text-red-400">{Math.round(m.similarity * 100)}% match</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="px-4 py-3 text-left font-medium">Stream</th>
              <th className="px-4 py-3 text-left font-medium">Fingerprint</th>
              <th className="px-4 py-3 text-left font-medium">Created</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {fingerprints.map(f => (
              <tr key={f.streamId} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-4 py-3 font-medium">{f.streamName || f.streamId}</td>
                <td className="px-4 py-3 font-mono text-xs">{f.uniqueId}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--muted)" }}>{new Date(f.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  {f.isMarked && <span className="text-xs px-2 py-0.5 rounded bg-red-900/30 text-red-400">Pirated</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => markPirated(f.streamId)} className="text-xs px-2 py-1 rounded hover:bg-white/5 text-red-400" title="Mark as pirated">Flag</button>
                  </div>
                </td>
              </tr>
            ))}
            {!fingerprints.length && (
              <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>No fingerprints generated yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
