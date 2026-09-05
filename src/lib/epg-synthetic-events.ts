/**
 * Synthetic EPG for event-style LIVE rows (PPV, MLS, dated matches, 24/7 loops)
 * that never appear in normal XMLTV guides. Parses the stream name into a
 * programme window and stores it under a dedicated nexlify:// EPG source.
 */

import { prisma } from "./prisma";
import { getSettingGroup } from "./panel-settings";
import { invalidateEpgCache } from "./cache-invalidate";

export const SYNTHETIC_EPG_SOURCE_NAME = "Nexlify Synthetic Events";
export const SYNTHETIC_EPG_SOURCE_URL = "nexlify://synthetic-events";
export const SYNTHETIC_EPG_CHANNEL_PREFIX = "nexlify.synth.";

export type SyntheticEventKind = "ppv" | "mls" | "sports_event" | "247" | "dated_match";

export type ParsedSyntheticEvent = {
  kind: SyntheticEventKind;
  title: string;
  description: string | null;
  start: Date;
  stop: Date;
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const DURATION_MS: Record<SyntheticEventKind, number> = {
  ppv: 4 * 3600_000,
  mls: 2.5 * 3600_000,
  sports_event: 3 * 3600_000,
  dated_match: 3 * 3600_000,
  "247": 24 * 3600_000,
};

const SPORTS_HINT =
  /\b(ufc|wwe|aew|boxing|mma|nba|nfl|nhl|mlb|f1|formula\s*1|cricket|tennis|golf|rugby|premier\s*league|champions\s*league|europa|laliga|serie\s*a|bundesliga|fight\s*night|ppv|mls|nascar|motogp)\b/i;

function wallParts(d: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
    hourCycle: "h23",
  });
  return Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
}

/** Build a Date for y-m-d hh:mm as wall clock in `timeZone`. */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = desired;
  for (let i = 0; i < 4; i++) {
    const p = wallParts(new Date(guess), timeZone);
    const shown = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second || "0")
    );
    guess += desired - shown;
  }
  return new Date(guess);
}

function cleanEventTitle(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^(?:PPV|UFC|MLS|NBA|NFL|NHL|WWE|AEW)\s*\d*\s*[:|.-]\s*/i, "");
  t = t.replace(/\b(FHD|UHD|4K|HEVC|HD|SD)\b/gi, " ");
  // Drop trailing date / kickoff fragments after | or ·
  t = t.replace(/\s*[|·•]\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday).*$/i, "");
  t = t.replace(/\s*[|·•]\s*\d{1,2}(:\d{2})?\s*(am|pm)?\s*$/i, "");
  t = t.replace(/\s{2,}/g, " ").trim();
  return t || raw.trim();
}

function detectKind(name: string): SyntheticEventKind | null {
  const n = name.trim();
  if (/\b24\s*\/\s*7\b/i.test(n) || /^24\s*7\b/i.test(n)) return "247";
  if (/\bPPV\b/i.test(n)) return "ppv";
  if (/\bMLS\b/i.test(n)) return "mls";
  if (
    /\bvs\.?\b/i.test(n) &&
    /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i.test(n)
  ) {
    return "dated_match";
  }
  if (/\bvs\.?\b/i.test(n) && (SPORTS_HINT.test(n) || /\b\d{1,2}(:\d{2})?\b/.test(n))) {
    return "sports_event";
  }
  if (
    /\b(UFC|Fight\s*Night|Boxing|WWE|AEW)\b/i.test(n) &&
    !/\b(Sky|ESPN|TNT|BT|DAZN)\s+Sports\b/i.test(n)
  ) {
    return "sports_event";
  }
  return null;
}

export function isEventStyleStreamName(name: string): boolean {
  return detectKind(name) != null;
}

export function isSyntheticEpgChannelId(id: string | null | undefined): boolean {
  return Boolean(id?.trim().startsWith(SYNTHETIC_EPG_CHANNEL_PREFIX));
}

export function syntheticEpgChannelIdForStream(streamId: string): string {
  return `${SYNTHETIC_EPG_CHANNEL_PREFIX}${streamId}`;
}

type KickoffHints = {
  hour: number | null;
  minute: number | null;
  day: number | null;
  month: number | null;
  weekday: number | null;
};

function extractKickoffHints(name: string): KickoffHints {
  const hints: KickoffHints = {
    hour: null,
    minute: null,
    day: null,
    month: null,
    weekday: null,
  };

  const wd = name.match(
    /\b(Sun(?:day)?|Mon(?:day)?|Tue(?:s|sday)?|Wed(?:nesday)?|Thu(?:r|rs|rsday)?|Fri(?:day)?|Sat(?:urday)?)\b/i
  );
  if (wd?.[1]) {
    const key = wd[1].toLowerCase().replace(/\./g, "");
    const mapped =
      WEEKDAYS[key] ??
      WEEKDAYS[key.slice(0, 3)] ??
      WEEKDAYS[key.slice(0, 4)];
    if (mapped != null) hints.weekday = mapped;
  }

  const dm = name.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i
  );
  if (dm) {
    hints.day = Number(dm[1]);
    hints.month = MONTHS[dm[2]!.toLowerCase()] ?? null;
  } else {
    const md = name.match(
      /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i
    );
    if (md) {
      hints.month = MONTHS[md[1]!.toLowerCase()] ?? null;
      hints.day = Number(md[2]);
    }
  }

  // Prefer HH:MM after weekday / pipe; avoid matching "MLS 15:" channel numbers.
  const timeAfterSep = name.match(
    /(?:\||·|•|\b(?:at|kickoff|ko)\b)\s*(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/i
  );
  const timeStandalone = name.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/i);
  const tm = timeAfterSep ?? timeStandalone;
  if (tm) {
    let hour = Number(tm[1]);
    const minute = Number(tm[2]);
    const ap = tm[3]?.toLowerCase();
    if (ap === "pm" && hour < 12) hour += 12;
    if (ap === "am" && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      hints.hour = hour;
      hints.minute = minute;
    }
  } else {
    // "Thu 19:00" already covered; bare "19h" / "7pm"
    const loose = name.match(/\b(\d{1,2})\s*(am|pm)\b/i);
    if (loose) {
      let hour = Number(loose[1]);
      const ap = loose[2]!.toLowerCase();
      if (ap === "pm" && hour < 12) hour += 12;
      if (ap === "am" && hour === 12) hour = 0;
      if (hour >= 0 && hour <= 23) {
        hints.hour = hour;
        hints.minute = 0;
      }
    }
  }

  return hints;
}

function resolveStart(
  hints: KickoffHints,
  now: Date,
  timeZone: string,
  durationMs: number
): Date {
  const nowParts = wallParts(now, timeZone);
  const year = Number(nowParts.year);
  const hour = hints.hour ?? Number(nowParts.hour);
  const minute = hints.minute ?? (hints.hour != null ? 0 : Number(nowParts.minute));

  if (hints.day != null && hints.month != null) {
    let start = zonedWallTimeToUtc(year, hints.month, hints.day, hour, minute, timeZone);
    // If the dated window ended more than 12h ago, try next year (Dec→Jan edge).
    if (start.getTime() + durationMs < now.getTime() - 12 * 3600_000) {
      start = zonedWallTimeToUtc(year + 1, hints.month, hints.day, hour, minute, timeZone);
    }
    // Stale playlist label still on air — pin to a live window.
    if (start.getTime() + durationMs < now.getTime() - 2 * 3600_000) {
      return new Date(now.getTime() - 30 * 60_000);
    }
    return start;
  }

  if (hints.weekday != null) {
    const wdToken = String(nowParts.weekday || "").toLowerCase().slice(0, 3);
    const today = WEEKDAYS[wdToken] ?? now.getUTCDay();
    let delta = hints.weekday - today;
    if (hints.hour != null) {
      const candidateToday = zonedWallTimeToUtc(
        year,
        Number(nowParts.month),
        Number(nowParts.day),
        hour,
        minute,
        timeZone
      );
      if (delta === 0 && candidateToday.getTime() + durationMs < now.getTime() - 3600_000) {
        delta = 7;
      } else if (delta < 0) {
        delta += 7;
      }
    } else if (delta < 0) {
      delta += 7;
    }
    const cal = new Date(Date.UTC(year, Number(nowParts.month) - 1, Number(nowParts.day)));
    cal.setUTCDate(cal.getUTCDate() + delta);
    return zonedWallTimeToUtc(
      cal.getUTCFullYear(),
      cal.getUTCMonth() + 1,
      cal.getUTCDate(),
      hour,
      minute,
      timeZone
    );
  }

  if (hints.hour != null) {
    const todayStart = zonedWallTimeToUtc(
      year,
      Number(nowParts.month),
      Number(nowParts.day),
      hour,
      minute,
      timeZone
    );
    if (todayStart.getTime() + durationMs < now.getTime() - 3600_000) {
      return new Date(todayStart.getTime() + 86400_000);
    }
    return todayStart;
  }

  // No schedule in the name — treat as live now.
  return new Date(now.getTime() - 15 * 60_000);
}

export function parseEventFromStreamName(
  name: string,
  opts?: { now?: Date; timeZone?: string }
): ParsedSyntheticEvent | null {
  const kind = detectKind(name);
  if (!kind) return null;

  const now = opts?.now ?? new Date();
  const timeZone = opts?.timeZone || "Europe/London";
  const title = cleanEventTitle(name);
  const durationMs = DURATION_MS[kind];

  if (kind === "247") {
    const start = new Date(now.getTime() - 60 * 60_000);
    const stop = new Date(start.getTime() + durationMs);
    return {
      kind,
      title: title || "24/7",
      description: "Continuous 24/7 loop (synthetic EPG)",
      start,
      stop,
    };
  }

  const hints = extractKickoffHints(name);
  const start = resolveStart(hints, now, timeZone, durationMs);
  const stop = new Date(start.getTime() + durationMs);

  return {
    kind,
    title,
    description: `Synthetic EPG from stream name (${kind})`,
    start,
    stop,
  };
}

export async function ensureSyntheticEpgSource(): Promise<string> {
  const existing = await prisma.epgSource.findFirst({
    where: { url: SYNTHETIC_EPG_SOURCE_URL },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.epgSource.create({
    data: {
      name: SYNTHETIC_EPG_SOURCE_NAME,
      url: SYNTHETIC_EPG_SOURCE_URL,
      sourceType: "synthetic",
      isActive: true,
      syncEveryHours: 8760,
      config: { system: true, kind: "synthetic-events" },
    },
    select: { id: true },
  });
  return created.id;
}

async function hasFuturePrograms(channelId: string, now: Date): Promise<boolean> {
  const row = await prisma.epgProgram.findFirst({
    where: { channelId, stop: { gte: now } },
    select: { id: true },
  });
  return Boolean(row);
}

export type SyntheticEpgSyncResult = {
  scanned: number;
  assigned: number;
  programs: number;
  skipped: number;
};

/**
 * Assign synthetic epgChannelId + programme rows for event-style LIVE streams
 * that lack a working XMLTV listing.
 */
export async function syncSyntheticEventEpg(opts?: {
  limit?: number;
  now?: Date;
}): Promise<SyntheticEpgSyncResult> {
  const limit = opts?.limit ?? 500;
  const now = opts?.now ?? new Date();
  const general = await getSettingGroup("general");
  const timeZone = String(general.timezone || "Europe/London");
  const sourceId = await ensureSyntheticEpgSource();

  const streams = await prisma.stream.findMany({
    where: { type: "LIVE", isActive: true },
    select: { id: true, name: true, epgChannelId: true },
    orderBy: { updatedAt: "desc" },
    take: Math.max(limit * 4, 2000),
  });

  let scanned = 0;
  let assigned = 0;
  let programs = 0;
  let skipped = 0;

  for (const stream of streams) {
    if (!isEventStyleStreamName(stream.name)) continue;
    scanned++;
    if (scanned > limit && assigned >= limit) break;

    const parsed = parseEventFromStreamName(stream.name, { now, timeZone });
    if (!parsed) {
      skipped++;
      continue;
    }

    const existingId = stream.epgChannelId?.trim() || "";
    const alreadySynthetic = isSyntheticEpgChannelId(existingId);
    const forceSynthetic =
      parsed.kind === "ppv" || parsed.kind === "mls" || parsed.kind === "247";

    if (existingId && !alreadySynthetic && !forceSynthetic) {
      const working = await hasFuturePrograms(existingId, now);
      if (working) {
        skipped++;
        continue;
      }
    }

    const channelId = alreadySynthetic && existingId
      ? existingId
      : syntheticEpgChannelIdForStream(stream.id);

    await prisma.epgProgram.deleteMany({
      where: { sourceId, channelId },
    });

    await prisma.epgProgram.create({
      data: {
        sourceId,
        channelId,
        title: parsed.title.slice(0, 240),
        description: parsed.description,
        start: parsed.start,
        stop: parsed.stop,
      },
    });
    programs++;

    if (existingId !== channelId) {
      await prisma.stream.update({
        where: { id: stream.id },
        data: { epgChannelId: channelId },
      });
      assigned++;
    } else {
      assigned++;
    }

    if (assigned >= limit) break;
  }

  if (programs > 0) {
    await prisma.epgSource.update({
      where: { id: sourceId },
      data: { lastSync: now, lastSyncError: null },
    });
    await invalidateEpgCache();
  }

  return { scanned, assigned, programs, skipped };
}
