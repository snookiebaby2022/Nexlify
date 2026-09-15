"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type PulseRow = {
  id: string;
  name: string;
  category?: { name: string } | null;
  lastProbeOk?: boolean | null;
  epgChannelId?: string | null;
  epgWorking?: boolean | null;
  liveStats?: { viewers?: number; videoCodec?: string; audioCodec?: string; bitrateKbps?: number } | null;
};

export default function ChannelPulsePage() {
  const [rows, setRows] = useState<PulseRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/admin/streams?type=LIVE&withStats=1&pageSize=60&page=1")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.streams ?? []) as PulseRow[];
        list.sort((a, b) => (b.liveStats?.viewers ?? 0) - (a.liveStats?.viewers ?? 0));
        setRows(list);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Channel Pulse</h1>
        <p className="text-sm mt-1 max-w-2xl" style={{ color: "var(--muted)" }}>
          Unique operator view: viewers, codec, EPG, and probe on one board. XUI and 1-Stream keep this
          split across three screens.
        </p>
      </div>
      {loading ? <p className="text-sm">Loading pulse…</p> : null}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {rows.map((s) => {
          const viewers = s.liveStats?.viewers ?? 0;
          return (
            <Link
              key={s.id}
              href={`/admin/content/streams?edit=${s.id}`}
              className="rounded-2xl border p-4 block"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
            >
              <p className="font-medium truncate">{s.name}</p>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                {s.category?.name ?? "Uncategorised"}
              </p>
              <div className="flex flex-wrap gap-1 mt-3">
                <Chip label={`${viewers} watching`} tone={viewers > 0 ? "ok" : undefined} />
                {s.liveStats?.videoCodec ? <Chip label={s.liveStats.videoCodec} /> : null}
                {s.liveStats?.audioCodec ? <Chip label={s.liveStats.audioCodec} /> : null}
                <Chip
                  label={s.epgChannelId ? (s.epgWorking ? "EPG live" : "EPG mapped") : "No EPG"}
                  tone={s.epgChannelId ? (s.epgWorking ? "ok" : "warn") : undefined}
                />
                <Chip
                  label={s.lastProbeOk === false ? "Probe fail" : s.lastProbeOk ? "Source OK" : "Not probed"}
                  tone={s.lastProbeOk === false ? "bad" : s.lastProbeOk ? "ok" : undefined}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ label, tone }: { label: string; tone?: "ok" | "warn" | "bad" }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{
        background:
          tone === "ok"
            ? "rgba(34,197,94,0.16)"
            : tone === "warn"
              ? "rgba(251,191,36,0.16)"
              : tone === "bad"
                ? "rgba(239,68,68,0.16)"
                : "rgba(148,163,184,0.14)",
        color:
          tone === "ok" ? "#4ade80" : tone === "warn" ? "#fbbf24" : tone === "bad" ? "#f87171" : "var(--text)",
      }}
    >
      {label}
    </span>
  );
}
