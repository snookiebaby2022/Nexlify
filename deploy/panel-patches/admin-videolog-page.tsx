"use client";

import { useEffect, useState } from "react";
import { RadioProbePlayer } from "@/components/radio-probe-player";

type StreamRow = {
  id: string;
  name: string;
  type: string;
  streamUrl: string;
  lastProbeOk: boolean | null;
  lastProbeAt: string | null;
  lastProbeError: string | null;
};

export default function AdminVideoLogPage() {
  const [streams, setStreams] = useState<StreamRow[]>([]);
  const [type, setType] = useState("LIVE");
  const [selected, setSelected] = useState<StreamRow | null>(null);
  const [q, setQ] = useState("");

  function load() {
    const params = new URLSearchParams({ type, limit: "100" });
    fetch(`/api/admin/streams?${params}`)
      .then((r) => r.json())
      .then((d) => setStreams(d.streams ?? d.items ?? []));
  }

  useEffect(() => {
    load();
  }, [type]);

  const filtered = streams.filter((s) =>
    !q.trim() ? true : s.name.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Video log</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Probe and preview live streams, radio, and on-demand sources from the panel.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {["LIVE", "MOVIE", "SERIES", "RADIO"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className="rounded-full px-4 py-1.5 text-sm cursor-pointer border"
            style={{
              borderColor: type === t ? "var(--accent)" : "var(--border)",
              background: type === t ? "var(--accent)" : "transparent",
              color: type === t ? "#fff" : "inherit",
            }}
          >
            {t}
          </button>
        ))}
        <input
          className="rounded-lg border px-3 py-1.5 text-sm ml-auto"
          style={{ borderColor: "var(--border)" }}
          placeholder="Filter by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ul
          className="rounded-xl border divide-y max-h-[480px] overflow-y-auto"
          style={{ borderColor: "var(--border)" }}
        >
          {filtered.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelected(s)}
                className="w-full text-left px-4 py-3 cursor-pointer hover:opacity-90"
                style={{
                  background: selected?.id === s.id ? "var(--bg-card)" : "transparent",
                }}
              >
                <div className="font-medium text-sm">{s.name}</div>
                <div className="text-xs mt-0.5 flex gap-2" style={{ color: "var(--muted)" }}>
                  <span>{s.type}</span>
                  {s.lastProbeOk === true && (
                    <span style={{ color: "var(--success)" }}>Online</span>
                  )}
                  {s.lastProbeOk === false && (
                    <span style={{ color: "var(--danger)" }}>Offline</span>
                  )}
                </div>
              </button>
            </li>
          ))}
          {!filtered.length && (
            <li className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
              No streams
            </li>
          )}
        </ul>

        <div
          className="rounded-xl border p-4 min-h-[280px]"
          style={{ borderColor: "var(--border)" }}
        >
          {selected ? (
            <div className="space-y-4">
              <h2 className="font-semibold">{selected.name}</h2>
              <p className="text-xs break-all" style={{ color: "var(--muted)" }}>
                {selected.streamUrl}
              </p>
              {selected.lastProbeError && (
                <p className="text-xs" style={{ color: "var(--danger)" }}>
                  Last probe: {selected.lastProbeError}
                </p>
              )}
              <RadioProbePlayer
                streamId={selected.id}
                streamUrl={selected.streamUrl}
                name={selected.name}
                playFirst
              />
            </div>
          ) : (
            <p className="text-sm py-12 text-center" style={{ color: "var(--muted)" }}>
              Select a stream to probe and preview
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
