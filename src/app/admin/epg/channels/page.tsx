"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";

type Row = {
  id: string;
  name: string;
  epgChannelId: string | null;
  channelId: string | null;
  category?: { name: string } | null;
};

export default function AdminEpgChannelsPage() {
  const [streams, setStreams] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Record<string, { epg: string; channel: string }>>({});
  const [bulkMsg, setBulkMsg] = useState("");

  function load() {
    fetch("/api/admin/epg/channels")
      .then((r) => r.json())
      .then((d) => {
        setStreams(d.streams);
        const map: Record<string, { epg: string; channel: string }> = {};
        for (const s of d.streams) {
          map[s.id] = {
            epg: s.epgChannelId ?? "",
            channel: s.channelId ?? s.id,
          };
        }
        setEditing(map);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function save(streamId: string) {
    const row = editing[streamId];
    await fetch("/api/admin/epg/channels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        streamId,
        epgChannelId: row?.epg ?? "",
        channelId: row?.channel?.trim() || streamId,
      }),
    });
    load();
  }

  async function autoGenerateAll() {
    setBulkMsg("");
    const res = await fetch("/api/admin/epg/channels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoGenerateChannelIds: true }),
    });
    const data = await res.json();
    setBulkMsg(
      res.ok
        ? `Set stream ID on ${data.updated ?? 0} stream(s) that were empty.`
        : data.error ?? "Failed"
    );
    load();
  }

  function fillChannelFromStreamId(streamId: string) {
    setEditing((prev) => ({
      ...prev,
      [streamId]: { ...prev[streamId], channel: streamId, epg: prev[streamId]?.epg ?? "" },
    }));
  }

  function downloadExport() {
    window.location.href = "/api/admin/lines/export?format=epg_map&type=LIVE";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="text-2xl font-semibold">EPG channel map</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={autoGenerateAll}
            className="text-sm px-3 py-2 rounded-md cursor-pointer"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Auto-fill empty stream ID
          </button>
          <button
            type="button"
            onClick={downloadExport}
            className="text-sm px-3 py-2 rounded-md border cursor-pointer"
            style={{ borderColor: "var(--border)" }}
          >
            Download EPG map CSV
          </button>
        </div>
      </div>
      {bulkMsg && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {bulkMsg}
        </p>
      )}
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        <strong>Stream ID</strong> is the client/Stalker ID (defaults to the panel stream ID).
        <strong> epg_id</strong> is the XMLTV <code>channel=</code> value. Both are included in M3U and export files.
      </p>

      <DataTable
        headers={["Stream", "Category", "Stream ID", "epg_id", ""]}
        rows={streams.map((s) => [
          s.name,
          s.category?.name ?? "—",
          <div key={`ch-${s.id}`} className="flex flex-col gap-1">
            <input
              className="rounded border px-2 py-1 text-sm bg-transparent w-full max-w-[160px] font-mono"
              style={{ borderColor: "var(--border)" }}
              value={editing[s.id]?.channel ?? s.id}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  [s.id]: { ...editing[s.id], channel: e.target.value, epg: editing[s.id]?.epg ?? "" },
                })
              }
              placeholder={s.id}
            />
            <button
              type="button"
              className="text-[10px] underline text-left cursor-pointer"
              style={{ color: "var(--accent)" }}
              onClick={() => fillChannelFromStreamId(s.id)}
            >
              Use stream ID
            </button>
          </div>,
          <input
            key={`epg-${s.id}`}
            className="rounded border px-2 py-1 text-sm bg-transparent w-full max-w-[140px] font-mono"
            style={{ borderColor: "var(--border)" }}
            value={editing[s.id]?.epg ?? ""}
            onChange={(e) =>
              setEditing({
                ...editing,
                [s.id]: { ...editing[s.id], epg: e.target.value, channel: editing[s.id]?.channel ?? s.id },
              })
            }
            placeholder="xmltv.channel.id"
          />,
          <button
            key={`btn-${s.id}`}
            type="button"
            className="text-xs px-2 py-1 rounded cursor-pointer"
            style={{ background: "var(--accent)", color: "#fff" }}
            onClick={() => save(s.id)}
          >
            Save
          </button>,
        ])}
      />
    </div>
  );
}
