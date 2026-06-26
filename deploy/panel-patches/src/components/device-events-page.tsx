"use client";

import { useCallback, useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";

type StbEvent = {
  id: string;
  deviceType: string;
  mac: string | null;
  lineId: string | null;
  event: string;
  createdAt: string;
};

export function DeviceEventsPage() {
  const [events, setEvents] = useState<StbEvent[]>([]);
  const [lineId, setLineId] = useState("");
  const [lines, setLines] = useState<{ id: string; username: string }[]>([]);

  const load = useCallback(() => {
    const q = lineId ? `?lineId=${encodeURIComponent(lineId)}` : "";
    fetch(`/api/admin/stb-events${q}`)
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []));
  }, [lineId]);

  useEffect(() => {
    fetch("/api/admin/lines")
      .then((r) => r.json())
      .then((d) => setLines(d.lines ?? []));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Device events</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          MAG and Enigma2 STB portal events (boot, channel change, errors). Refreshes every 20s.
        </p>
      </div>

      <select
        className="rounded border px-3 py-2 bg-transparent max-w-md"
        style={{ borderColor: "var(--border)" }}
        value={lineId}
        onChange={(e) => setLineId(e.target.value)}
      >
        <option value="">All lines</option>
        {lines.map((l) => (
          <option key={l.id} value={l.id}>
            {l.username}
          </option>
        ))}
      </select>

      <DataTable
        headers={["Time", "Device", "MAC", "Event", "Line"]}
        rows={events.map((e) => [
          formatDateTime(e.createdAt),
          e.deviceType,
          e.mac ?? "—",
          e.event,
          lines.find((l) => l.id === e.lineId)?.username ?? e.lineId ?? "—",
        ])}
      />

      {events.length === 0 && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No device events recorded yet.
        </p>
      )}
    </div>
  );
}
