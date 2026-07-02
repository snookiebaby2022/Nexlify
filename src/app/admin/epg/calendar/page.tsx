"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type EpgProgram = {
  id: string;
  title: string;
  start: string;
  end: string;
  channelName: string;
  channelId: string;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function parseTime(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

function durationHours(start: string, end: string): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return Math.max((e - s) / 3600000, 0.5);
}

export default function EpgCalendarPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [programs, setPrograms] = useState<EpgProgram[]>([]);
  const [channels, setChannels] = useState<string[]>([]);

  const today = new Date();
  const weekStart = useMemo(() => startOfWeek(new Date(today)), []);
  const currentWeekStart = useMemo(() => addDays(new Date(weekStart), weekOffset * 7), [weekStart, weekOffset]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(new Date(currentWeekStart), i)), [currentWeekStart]);

  const load = useCallback(() => {
    const start = formatDate(weekDays[0]);
    const end = formatDate(weekDays[6]);
    fetch(`/api/admin/epg/calendar?start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((d) => {
        setPrograms(d.programs ?? []);
        const ch = [...new Set((d.programs ?? []).map((p: EpgProgram) => p.channelName))].sort() as string[];
        setChannels(ch);
      })
      .catch(() => {});
  }, [weekDays]);

  useEffect(() => {
    load();
  }, [load]);

  const programsByDay = useMemo(() => {
    const byDay: Record<string, EpgProgram[]> = {};
    weekDays.forEach((d) => {
      const key = formatDate(d);
      byDay[key] = programs.filter((p) => {
        const pd = formatDate(new Date(p.start));
        return pd === key;
      });
    });
    return byDay;
  }, [programs, weekDays]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">EPG Calendar</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Week view of scheduled programs across all channels.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="p-2 rounded border" style={{ borderColor: "var(--border)" }} onClick={() => setWeekOffset((o) => o - 1)}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="px-3 py-2 rounded border text-sm" style={{ borderColor: "var(--border)" }} onClick={() => setWeekOffset(0)}>
            Today
          </button>
          <button type="button" className="p-2 rounded border" style={{ borderColor: "var(--border)" }} onClick={() => setWeekOffset((o) => o + 1)}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium" style={{ color: "var(--muted)" }}>
        {weekDays.map((d, i) => (
          <div key={i} className={`p-2 rounded ${formatDate(d) === formatDate(today) ? "bg-white/10" : ""}`}>
            {DAYS[d.getDay()]} {d.getDate()}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((d) => {
          const key = formatDate(d);
          const dayProgs = programsByDay[key] || [];
          return (
            <div key={key} className="min-h-[300px] rounded border p-2 space-y-1" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              {dayProgs.map((p) => {
                const startHour = parseTime(p.start);
                const dur = durationHours(p.start, p.end);
                return (
                  <div
                    key={p.id}
                    className="rounded px-2 py-1 text-xs cursor-pointer hover:opacity-90"
                    style={{ background: "rgba(0,192,239,0.15)", borderLeft: "3px solid var(--accent)" }}
                    title={`${p.channelName}: ${p.title} (${new Date(p.start).toLocaleTimeString()} - ${new Date(p.end).toLocaleTimeString()})`}
                  >
                    <div className="font-medium truncate">{p.title}</div>
                    <div className="text-[10px] opacity-70">{p.channelName}</div>
                    <div className="text-[10px] opacity-70">
                      {new Date(p.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - {new Date(p.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                );
              })}
              {!dayProgs.length && (
                <div className="text-xs text-center py-4" style={{ color: "var(--muted)" }}>No programs</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-xs" style={{ color: "var(--muted)" }}>Channels: {channels.length} · Programs this week: {programs.length}</div>
    </div>
  );
}
