"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Film, Plus, Upload } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { StreamProbePlayer } from "@/components/stream-probe-player";
import { formatDateTime } from "@/lib/format";

type VideoStream = {
  id: string;
  name: string;
  streamUrl: string;
  isActive: boolean;
  vodMode?: string;
  isOnDemand?: boolean;
  containerExtension?: string | null;
  server?: { name: string } | null;
  category?: { name: string } | null;
  lastProbeOk?: boolean | null;
  updatedAt?: string;
};

export function AdminVideoManagement() {
  const [streams, setStreams] = useState<VideoStream[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      video: "1",
      page: String(page),
      pageSize: "50",
    });
    fetch(`/api/admin/streams?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setStreams(d.streams ?? []);
        setTotal(d.total ?? d.streams?.length ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = streams.find((s) => s.id === selectedId);

  async function remove(id: string) {
    if (!confirm("Delete this video source?")) return;
    await fetch(`/api/admin/streams?id=${id}`, { method: "DELETE" });
    if (selectedId === id) setSelectedId(null);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Film size={24} style={{ color: "#a78bfa" }} />
            Video management
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            On-demand video sources, direct files, and HLS/VOD channels (excludes radio &amp; created channels).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/streams/add"
            className="text-sm px-3 py-2 rounded-md flex items-center gap-1.5"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            <Plus size={14} />
            Add stream
          </Link>
          <Link
            href="/admin/import/m3u"
            className="text-sm px-3 py-2 rounded-md border flex items-center gap-1.5"
            style={{ borderColor: "var(--border)" }}
          >
            <Upload size={14} />
            Import M3U
          </Link>
          <Link
            href="/admin/videolog"
            className="text-sm px-3 py-2 rounded-md border"
            style={{ borderColor: "var(--border)" }}
          >
            Video log
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
        <div
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          {loading && (
            <p className="p-6 text-sm" style={{ color: "var(--muted)" }}>
              Loading video sources…
            </p>
          )}
          {!loading && streams.length === 0 && (
            <div className="p-10 text-center">
              <Film className="mx-auto mb-3 opacity-30" size={40} />
              <p className="font-medium">No video sources yet</p>
              <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                Add streams as on-demand or import an M3U playlist.
              </p>
            </div>
          )}
          {!loading && streams.length > 0 && (
            <DataTable
              headers={["Name", "Server", "Mode", "Probe", "Status", ""]}
              rows={streams.map((s) => [
                <button
                  key={`n-${s.id}`}
                  type="button"
                  className="text-left font-medium cursor-pointer hover:underline"
                  style={{ color: selectedId === s.id ? "var(--accent)" : "var(--text)" }}
                  onClick={() => setSelectedId(s.id)}
                >
                  {s.name}
                </button>,
                s.server?.name ?? "—",
                s.vodMode ?? (s.isOnDemand ? "ON_DEMAND" : "LIVE"),
                s.lastProbeOk === true ? (
                  <span style={{ color: "#22c55e" }}>OK</span>
                ) : s.lastProbeOk === false ? (
                  <span style={{ color: "#ef4444" }}>Fail</span>
                ) : (
                  "—"
                ),
                s.isActive ? "Active" : "Off",
                <div key={`a-${s.id}`} className="flex gap-2 text-xs">
                  <Link href={`/admin/servers/streams?edit=${s.id}`} style={{ color: "var(--accent)" }}>
                    Edit
                  </Link>
                  <button
                    type="button"
                    className="cursor-pointer"
                    style={{ color: "var(--danger)" }}
                    onClick={() => void remove(s.id)}
                  >
                    Delete
                  </button>
                </div>,
              ])}
            />
          )}
          {total > 50 && (
            <div className="flex justify-center gap-2 p-3 border-t" style={{ borderColor: "var(--border)" }}>
              <button
                type="button"
                disabled={page <= 1}
                className="text-sm px-3 py-1 rounded border cursor-pointer disabled:opacity-40"
                style={{ borderColor: "var(--border)" }}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <span className="text-sm py-1" style={{ color: "var(--muted)" }}>
                Page {page}
              </span>
              <button
                type="button"
                disabled={streams.length < 50}
                className="text-sm px-3 py-1 rounded border cursor-pointer disabled:opacity-40"
                style={{ borderColor: "var(--border)" }}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {selected ? (
            <>
              <StreamProbePlayer
                playFirst
                streamId={selected.id}
                streamUrl={selected.streamUrl}
                name={selected.name}
              />
              <div
                className="rounded-xl border p-4 space-y-2 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
              >
                <p className="font-semibold">{selected.name}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  {selected.vodMode ?? (selected.isOnDemand ? "ON_DEMAND" : "LIVE")}
                  {selected.containerExtension ? ` · .${selected.containerExtension}` : ""}
                </p>
                <p className="text-xs break-all font-mono" style={{ color: "var(--muted)" }}>
                  {selected.streamUrl}
                </p>
                {selected.updatedAt && (
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    Updated {formatDateTime(selected.updatedAt)}
                  </p>
                )}
                <Link
                  href={`/admin/servers/streams?edit=${selected.id}`}
                  className="inline-block text-sm font-semibold mt-2"
                  style={{ color: "var(--accent)" }}
                >
                  Open in stream editor →
                </Link>
              </div>
            </>
          ) : (
            <p
              className="text-sm rounded-xl border p-8 text-center"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              Select a video source to probe playback and inspect the URL.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
