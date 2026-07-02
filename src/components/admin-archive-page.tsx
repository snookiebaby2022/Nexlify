"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";

type StreamRow = {
  id: string;
  name: string;
  type: string;
  timeshiftSeconds: number | null;
  archiveDays: number | null;
  isShifted: boolean;
  lastProbeOk: boolean | null;
};

export default function AdminArchivePage() {
  const [streams, setStreams] = useState<StreamRow[]>([]);
  const [analytics, setAnalytics] = useState<{
    timeshiftArchiveStreams: number;
    transcodeStreams: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/streams?type=LIVE&limit=500")
      .then((r) => r.json())
      .then((d) => {
        const all = (d.streams ?? d.items ?? []) as StreamRow[];
        setStreams(
          all.filter(
            (s) =>
              s.isShifted ||
              (s.timeshiftSeconds != null && s.timeshiftSeconds > 0) ||
              (s.archiveDays != null && s.archiveDays > 0)
          )
        );
      });
    fetch("/api/admin/analytics")
      .then((r) => r.json())
      .then(setAnalytics);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Timeshift &amp; archive</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Catch-up presets: 24h (1 day), 48h (2 days), 72h (3 days) archive. Configure per stream under{" "}
          <Link href="/admin/servers/streams" className="underline" style={{ color: "var(--accent)" }}>
            Streams
          </Link>{" "}
          → Advanced → Timeshift seconds / Archive days.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
          <div className="text-2xl font-bold">{streams.length}</div>
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            Archive / timeshift streams
          </div>
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
          <div className="text-2xl font-bold">{analytics?.transcodeStreams ?? "—"}</div>
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            Transcode-enabled streams
          </div>
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
          <div className="text-sm font-medium">Global transcode preset</div>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Set in Settings → Streams → transcode preset (veryfast, fast, medium…). Agent applies on
            edge servers.
          </p>
          <Link
            href="/admin/settings"
            className="text-xs underline mt-2 inline-block"
            style={{ color: "var(--accent)" }}
          >
            Open settings
          </Link>
        </div>
      </div>

      <DataTable
        headers={["Stream", "Timeshift (s)", "Archive (days)", "Shifted", "Probe", ""]}
        rows={streams.map((s) => [
          s.name,
          s.timeshiftSeconds ?? "—",
          s.archiveDays ?? "—",
          s.isShifted ? "Yes" : "No",
          s.lastProbeOk === true ? "OK" : s.lastProbeOk === false ? "Fail" : "—",
          <Link
            key={s.id}
            href={`/admin/servers/streams?edit=${s.id}`}
            className="text-xs underline"
            style={{ color: "var(--accent)" }}
          >
            Edit
          </Link>,
        ])}
      />

      {!streams.length && (
        <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
          No streams with timeshift or archive yet. Enable on a live stream to list it here.
        </p>
      )}
    </div>
  );
}
