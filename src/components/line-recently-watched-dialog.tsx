"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";

type WatchSummary = {
  lastWatchedAt: string | null;
  lastWatchedStream: { id: string; name: string } | null;
  channelsWatched: number;
  recentChannels: {
    streamId: string;
    name: string;
    type: string;
    watchCount: number;
    lastWatchedAt: string;
  }[];
};

export function LineRecentlyWatchedDialog({
  lineId,
  username,
  open,
  onClose,
}: {
  lineId: string;
  username: string;
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<WatchSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/lines/${lineId}/watch`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? "Could not load watch history");
        setData(body as WatchSummary);
      })
      .catch((e: Error) => {
        setData(null);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [open, lineId]);

  if (!open) return null;

  return (
    <>
      <button type="button" className="xui-lines-action-backdrop" aria-label="Close" onClick={onClose} />
      <div
        className="fixed z-[10050] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,28rem)] rounded-xl border shadow-2xl p-4 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
        role="dialog"
        aria-labelledby="recently-watched-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="recently-watched-title" className="text-sm font-semibold">
              Recently watched
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              {username}
            </p>
          </div>
          <button type="button" className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)" }} onClick={onClose}>
            Close
          </button>
        </div>

        {loading && <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {!loading && !error && data && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--muted)" }}>Last channel</p>
              <p className="font-medium">{data.lastWatchedStream?.name ?? "—"}</p>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                {data.lastWatchedAt ? formatDateTime(data.lastWatchedAt) : "No playback recorded yet"}
              </p>
              <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                {data.channelsWatched} unique channel{data.channelsWatched === 1 ? "" : "s"} watched
              </p>
            </div>

            {data.recentChannels.length > 0 ? (
              <ul className="max-h-52 overflow-y-auto divide-y rounded-lg border" style={{ borderColor: "var(--border)" }}>
                {data.recentChannels.map((row) => (
                  <li key={row.streamId} className="px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.name}</p>
                      <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                        {formatDateTime(row.lastWatchedAt)} · {row.watchCount} play{row.watchCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase shrink-0" style={{ color: "var(--muted)" }}>
                      {row.type}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                No channel history yet. Playback is recorded when the line watches live streams.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
