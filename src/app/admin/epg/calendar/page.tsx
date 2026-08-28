"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatEpgDateTimeLabel, type PanelTimeFormat } from "@/lib/epg-time";

type EpgProgram = {
  id: string;
  title: string;
  start: string;
  end: string;
  channelName: string;
  channelId: string;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_PER_DAY = 24;

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatEpgDateTimeLabelSafe(iso: string, display: { timezone: string; timeFormat: PanelTimeFormat }) {
  try {
    return formatEpgDateTimeLabel(iso, display);
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

export default function EpgCalendarPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [programs, setPrograms] = useState<EpgProgram[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [channelFilter, setChannelFilter] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [totalInRange, setTotalInRange] = useState(0);
  const [loading, setLoading] = useState(true);
  const [display, setDisplay] = useState<{ timezone: string; timeFormat: PanelTimeFormat }>({
    timezone: "Europe/London",
    timeFormat: "24",
  });

  const today = new Date();
  const weekStart = useMemo(() => startOfWeek(new Date(today)), []);
  const currentWeekStart = useMemo(() => addDays(new Date(weekStart), weekOffset * 7), [weekStart, weekOffset]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(new Date(currentWeekStart), i)),
    [currentWeekStart]
  );

  const load = useCallback(() => {
    setLoading(true);
    const start = formatDate(weekDays[0]);
    const end = formatDate(weekDays[6]);
    const q = channelFilter ? `&channelId=${encodeURIComponent(channelFilter)}` : "";
    fetch(`/api/admin/epg/calendar?start=${start}&end=${end}${q}`)
      .then((r) => r.json())
      .then((d) => {
        setPrograms(d.programs ?? []);
        setChannels(d.channels ?? []);
        setTruncated(Boolean(d.truncated));
        setTotalInRange(typeof d.totalInRange === "number" ? d.totalInRange : 0);
        if (d.display?.timezone) {
          setDisplay({
            timezone: d.display.timezone,
            timeFormat: d.display.timeFormat === "12" ? "12" : "24",
          });
        }
      })
      .catch(() => {
        setPrograms([]);
        setChannels([]);
      })
      .finally(() => setLoading(false));
  }, [weekDays, channelFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const programsByDay = useMemo(() => {
    const byDay: Record<string, EpgProgram[]> = {};
    weekDays.forEach((d) => {
      const key = formatDate(d);
      byDay[key] = programs.filter((p) => formatDate(new Date(p.start)) === key);
    });
    return byDay;
  }, [programs, weekDays]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">EPG Calendar</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Week view ({display.timezone}, {display.timeFormat === "12" ? "12-hour" : "24-hour"} clock). Filter by
            channel to keep the view fast on large EPG databases.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="p-2 rounded border"
            style={{ borderColor: "var(--border)" }}
            onClick={() => setWeekOffset((o) => o - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded border text-sm"
            style={{ borderColor: "var(--border)" }}
            onClick={() => setWeekOffset(0)}
          >
            Today
          </button>
          <button
            type="button"
            className="p-2 rounded border"
            style={{ borderColor: "var(--border)" }}
            onClick={() => setWeekOffset((o) => o + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm block min-w-[220px]">
          <span className="font-medium">Channel</span>
          <select
            className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm"
            style={{ borderColor: "var(--border)" }}
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
          >
            <option value="">All channels (first {MAX_PER_DAY * 7} shown)</option>
            {channels.map((ch) => (
              <option key={ch} value={ch}>
                {ch}
              </option>
            ))}
          </select>
        </label>
        {truncated && (
          <p className="text-xs pb-2" style={{ color: "var(--muted)" }}>
            Showing first 400 of {totalInRange.toLocaleString()} programs in range — pick a channel to narrow results.
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-sm py-12 text-center" style={{ color: "var(--muted)" }}>
          Loading EPG…
        </p>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium" style={{ color: "var(--muted)" }}>
            {weekDays.map((d, i) => (
              <div
                key={i}
                className={`p-2 rounded ${formatDate(d) === formatDate(today) ? "bg-white/10" : ""}`}
              >
                {DAYS[d.getDay()]} {d.getDate()}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((d) => {
              const key = formatDate(d);
              const dayProgs = programsByDay[key] || [];
              const visible = dayProgs.slice(0, MAX_PER_DAY);
              const hidden = dayProgs.length - visible.length;
              return (
                <div
                  key={key}
                  className="min-h-[200px] max-h-[420px] overflow-y-auto rounded border p-2 space-y-1"
                  style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
                >
                  {visible.map((p) => (
                    <div
                      key={p.id}
                      className="rounded px-2 py-1 text-xs"
                      style={{ background: "rgba(0,192,239,0.15)", borderLeft: "3px solid var(--accent)" }}
                      title={`${p.channelName}: ${p.title}`}
                    >
                      <div className="font-medium truncate">{p.title}</div>
                      <div className="text-[10px] opacity-70 truncate">{p.channelName}</div>
                      <div className="text-[10px] opacity-70">
                        {formatEpgDateTimeLabelSafe(p.start, display)}
                      </div>
                    </div>
                  ))}
                  {hidden > 0 && (
                    <div className="text-[10px] text-center py-1" style={{ color: "var(--muted)" }}>
                      +{hidden} more
                    </div>
                  )}
                  {!dayProgs.length && (
                    <div className="text-xs text-center py-4" style={{ color: "var(--muted)" }}>
                      No programs
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Channels in range: {channels.length} · Programs loaded: {programs.length}
            {channelFilter ? ` · filtered: ${channelFilter}` : ""}
          </div>
        </>
      )}
    </div>
  );
}
