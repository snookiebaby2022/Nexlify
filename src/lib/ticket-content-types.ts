/**
 * Reseller ticket content types that feed Admin Dashboard
 * "User Reported Channels" and "New Channels Add Request" KPIs.
 *
 * Subjects are prefixed so counting is reliable (not fuzzy keyword matching alone).
 */

export type TicketIntent = "report" | "request";
export type TicketContentKind = "channels" | "movies" | "series";

export type TicketContentTypeId =
  | "report_channels"
  | "new_channels"
  | "movies"
  | "tv_series";

export type TicketContentTypeDef = {
  id: TicketContentTypeId;
  label: string;
  /** Fixed intent for Report/New Channels; Movies/Series ask for intent. */
  fixedIntent: TicketIntent | null;
  content: TicketContentKind;
  /** Prisma TicketCategory */
  categoryForIntent: Record<TicketIntent, "REPORT" | "SUGGESTION">;
};

export const TICKET_CONTENT_TYPES: TicketContentTypeDef[] = [
  {
    id: "report_channels",
    label: "Report Channels",
    fixedIntent: "report",
    content: "channels",
    categoryForIntent: { report: "REPORT", request: "SUGGESTION" },
  },
  {
    id: "new_channels",
    label: "New Channels",
    fixedIntent: "request",
    content: "channels",
    categoryForIntent: { report: "REPORT", request: "SUGGESTION" },
  },
  {
    id: "movies",
    label: "Movies",
    fixedIntent: null,
    content: "movies",
    categoryForIntent: { report: "REPORT", request: "SUGGESTION" },
  },
  {
    id: "tv_series",
    label: "TV Series / Episodes",
    fixedIntent: null,
    content: "series",
    categoryForIntent: { report: "REPORT", request: "SUGGESTION" },
  },
];

const CONTENT_LABEL: Record<TicketContentKind, string> = {
  channels: "Channels",
  movies: "Movies",
  series: "TV Series",
};

export function subjectPrefix(intent: TicketIntent, content: TicketContentKind): string {
  const verb = intent === "report" ? "Report" : "New";
  return `[${verb} ${CONTENT_LABEL[content]}]`;
}

export function buildTicketSubject(
  intent: TicketIntent,
  content: TicketContentKind,
  title: string
): string {
  const clean = title.trim().replace(/^\[(Report|New)\s+[^\]]+\]\s*/i, "");
  return `${subjectPrefix(intent, content)} ${clean}`.trim();
}

export type ClassifiedTicket = {
  intent: TicketIntent;
  content: TicketContentKind;
};

/** Parse structured prefix; fall back to legacy subject heuristics. */
export function classifyTicketSubject(subject: string): ClassifiedTicket | null {
  const s = String(subject ?? "").trim();
  const tagged = s.match(/^\[(Report|New)\s+(Channels|Movies|TV Series)\]/i);
  if (tagged) {
    const intent: TicketIntent = /^report$/i.test(tagged[1]!) ? "report" : "request";
    const raw = tagged[2]!.toLowerCase();
    const content: TicketContentKind =
      raw === "movies" ? "movies" : raw === "tv series" ? "series" : "channels";
    return { intent, content };
  }

  // Legacy / loose matching (pre-2.0.4 tickets)
  const channelRx = /channel|stream|epg|vod|missing|report|add request|movie|series|episode/i;
  if (!channelRx.test(s)) return null;
  const intent: TicketIntent = /request|add|new/i.test(s) ? "request" : "report";
  let content: TicketContentKind = "channels";
  if (/movie|film|vod/i.test(s) && !/channel/i.test(s)) content = "movies";
  else if (/series|episode|season/i.test(s)) content = "series";
  return { intent, content };
}

export type TicketContentBreakdown = {
  channels: number;
  movies: number;
  series: number;
};

export function emptyBreakdown(): TicketContentBreakdown {
  return { channels: 0, movies: 0, series: 0 };
}

export function sumBreakdown(b: TicketContentBreakdown): number {
  return b.channels + b.movies + b.series;
}
