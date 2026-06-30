import { prisma } from "@/lib/prisma";
import { listActiveConnections } from "@/lib/connections";
import { lookupGeoExtended } from "@/lib/connection-map-geo";
import { extractIpAddress, isPublicIp } from "@/lib/ip-country";
import { getCountryName } from "@/lib/country-names";
import {
  LineStatus,
  PanelRole,
  Prisma,
  StreamType,
  TicketPriority,
  TicketStatus,
} from "@prisma/client";

export type CountryWatch = {
  countryCode: string;
  countryName: string;
  channels: { name: string; count: number }[];
};

export type ProgressRow = {
  label: string;
  value: number;
  total: number;
  color: "green" | "blue" | "orange" | "red" | "purple";
};

export type SummaryCardData = {
  id: string;
  title: string;
  total: number;
  variant: "orange" | "green" | "purple" | "teal" | "emerald";
  href?: string;
  rows: ProgressRow[];
};

export type ExpiringLineRow = {
  id: string;
  username: string;
  expiresAt: string;
  daysLeft: number;
  ownerUsername: string | null;
  deviceType: "line" | "mag" | "enigma";
};

export type ExpiringSummary = {
  today: number;
  threeDays: number;
  sevenDays: number;
};

export type DeviceSummary = {
  mag: number;
  enigma: number;
  total: number;
};

export type NewLinesSummary = {
  today: number;
  week: number;
};

export type TrialLineRow = ExpiringLineRow & { createdAt: string };

export type OfflineStreamRow = {
  id: string;
  name: string;
  lastProbeError: string | null;
  lastProbeAt: string | null;
};

export type StreamHealthSummary = {
  totalLive: number;
  online: number;
  offline: number;
  offlineStreams: OfflineStreamRow[];
};

export type TicketQueueRow = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  updatedAt: string;
  createdByUsername: string | null;
};

export type TicketQueueSummary = {
  open: number;
  inProgress: number;
  urgent: number;
  rows: TicketQueueRow[];
};

export type TopResellerRow = {
  userId: string;
  username: string;
  lines: number;
  connections: number;
};

export type LowCreditRow = {
  userId: string;
  username: string;
  credits: number;
};

export type BandwidthSummary = {
  inPerMin: number;
  outPerMin: number;
  connections: number;
};

export type CreditWarning = {
  low: boolean;
  credits: number;
  threshold: number;
};

export type DashboardWidgetsPayload = {
  mostWatchedByCountry: CountryWatch[];
  cards: SummaryCardData[];
  expiringLines: ExpiringLineRow[];
  recentlyExpired: ExpiringLineRow[];
  expiringSummary: ExpiringSummary;
  devices: DeviceSummary;
  newLines: NewLinesSummary;
  trialExpiringLines: TrialLineRow[];
  streamHealth: StreamHealthSummary;
  tickets: TicketQueueSummary;
  topResellers: TopResellerRow[];
  lowCredits: LowCreditRow[];
  bandwidth: BandwidthSummary | null;
  creditWarning: CreditWarning | null;
  showOwner: boolean;
  showTopResellers: boolean;
  showOfflineStreams: boolean;
  ticketsHref: string;
  streamsHref: string;
};

const STALE_MS = 5 * 60 * 1000;
const EXPIRING_WINDOW_DAYS = 7;
const UNLIMITED_YEARS = 8;
const TRIAL_MAX_DAYS = 2.5;
const LOW_CREDIT_THRESHOLD = 100;

function isUnlimitedExpiry(expiresAt: Date) {
  const years = (expiresAt.getTime() - Date.now()) / (86400000 * 365);
  return years > UNLIMITED_YEARS;
}

function lineDeviceType(line: {
  magDevices: { id: string }[];
  enigmaDevices: { id: string }[];
}): ExpiringLineRow["deviceType"] {
  if (line.magDevices.length > 0) return "mag";
  if (line.enigmaDevices.length > 0) return "enigma";
  return "line";
}

async function getExpiringSummary(where: Prisma.LineWhereInput): Promise<ExpiringSummary> {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setUTCHours(23, 59, 59, 999);
  const threeDays = new Date(now.getTime() + 3 * 86400000);
  const sevenDays = new Date(now.getTime() + EXPIRING_WINDOW_DAYS * 86400000);
  const unlimitedCutoff = new Date(now.getTime() + UNLIMITED_YEARS * 365 * 86400000);

  const base = {
    ...where,
    status: LineStatus.ACTIVE,
    expiresAt: { gt: now, lt: unlimitedCutoff },
  };

  const [today, three, seven] = await Promise.all([
    prisma.line.count({ where: { ...base, expiresAt: { gt: now, lte: endOfToday } } }),
    prisma.line.count({ where: { ...base, expiresAt: { gt: now, lte: threeDays } } }),
    prisma.line.count({ where: { ...base, expiresAt: { gt: now, lte: sevenDays } } }),
  ]);

  return { today, threeDays: three, sevenDays: seven };
}

async function getExpiringLineRows(
  where: Prisma.LineWhereInput,
  limit: number,
  mode: "soon" | "recent"
): Promise<ExpiringLineRow[]> {
  const now = new Date();

  const expiresFilter =
    mode === "soon"
      ? {
          gt: now,
          lte: new Date(now.getTime() + EXPIRING_WINDOW_DAYS * 86400000),
        }
      : {
          gte: new Date(now.getTime() - EXPIRING_WINDOW_DAYS * 86400000),
          lte: now,
        };

  const lines = await prisma.line.findMany({
    where: {
      ...where,
      ...(mode === "soon" ? { status: LineStatus.ACTIVE } : {}),
      expiresAt: expiresFilter,
    },
    orderBy: { expiresAt: mode === "soon" ? "asc" : "desc" },
    take: limit,
    select: {
      id: true,
      username: true,
      expiresAt: true,
      owner: { select: { username: true } },
      magDevices: { select: { id: true }, take: 1 },
      enigmaDevices: { select: { id: true }, take: 1 },
    },
  });

  return lines
    .filter((l) => !isUnlimitedExpiry(l.expiresAt))
    .map((l) => {
      const msLeft = l.expiresAt.getTime() - now.getTime();
      const daysLeft =
        mode === "soon"
          ? Math.max(0, Math.ceil(msLeft / 86400000))
          : Math.floor(-msLeft / 86400000);
      return {
        id: l.id,
        username: l.username,
        expiresAt: l.expiresAt.toISOString(),
        daysLeft,
        ownerUsername: l.owner?.username ?? null,
        deviceType: lineDeviceType(l),
      };
    });
}

async function getDeviceSummary(where: Prisma.LineWhereInput): Promise<DeviceSummary> {
  const lineFilter = Object.keys(where).length ? { line: where } : {};
  const [mag, enigma] = await Promise.all([
    prisma.magDevice.count({ where: { ...lineFilter, isActive: true } }),
    prisma.enigmaDevice.count({ where: { ...lineFilter, isActive: true } }),
  ]);
  return { mag, enigma, total: mag + enigma };
}

async function getNewLinesSummary(where: Prisma.LineWhereInput): Promise<NewLinesSummary> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const [today, week] = await Promise.all([
    prisma.line.count({ where: { ...where, createdAt: { gte: startOfDay } } }),
    prisma.line.count({ where: { ...where, createdAt: { gte: weekAgo } } }),
  ]);

  return { today, week };
}

function expiringCard(
  summary: ExpiringSummary,
  linesHref: string
): SummaryCardData {
  const total = summary.sevenDays || 1;
  return {
    id: "expiring",
    title: "Expiring Soon",
    total: summary.sevenDays,
    variant: "orange",
    href: linesHref,
    rows: [
      { label: "Today", value: summary.today, total, color: "red" },
      { label: "3 Days", value: summary.threeDays, total, color: "orange" },
      { label: "7 Days", value: summary.sevenDays, total, color: "green" },
    ],
  };
}

function devicesCard(devices: DeviceSummary, href: string): SummaryCardData {
  const total = devices.total || 1;
  return {
    id: "devices",
    title: "MAG & Enigma",
    total: devices.total,
    variant: "teal",
    href,
    rows: [
      { label: "MAG", value: devices.mag, total, color: "green" },
      { label: "Enigma", value: devices.enigma, total, color: "blue" },
    ],
  };
}

function newLinesCard(newLines: NewLinesSummary, linesHref: string): SummaryCardData {
  const total = Math.max(newLines.week, 1);
  return {
    id: "new-lines",
    title: "New Lines",
    total: newLines.week,
    variant: "purple",
    href: linesHref,
    rows: [
      { label: "Today", value: newLines.today, total, color: "green" },
      { label: "This Week", value: newLines.week, total, color: "blue" },
    ],
  };
}

function streamHealthCard(health: StreamHealthSummary, streamsHref: string): SummaryCardData {
  const total = health.totalLive || 1;
  return {
    id: "stream-health",
    title: "Stream Health",
    total: health.totalLive,
    variant: "green",
    href: streamsHref,
    rows: [
      { label: "Online", value: health.online, total, color: "green" },
      { label: "Offline", value: health.offline, total, color: "red" },
    ],
  };
}

function ticketsCard(tickets: TicketQueueSummary, ticketsHref: string): SummaryCardData {
  const total = Math.max(tickets.open + tickets.inProgress, 1);
  return {
    id: "tickets",
    title: "Support Tickets",
    total: tickets.open + tickets.inProgress,
    variant: "purple",
    href: ticketsHref,
    rows: [
      { label: "Open", value: tickets.open, total, color: "blue" },
      { label: "In Progress", value: tickets.inProgress, total, color: "orange" },
      { label: "Urgent", value: tickets.urgent, total, color: "red" },
    ],
  };
}

function bandwidthCard(bw: BandwidthSummary, href: string): SummaryCardData {
  const peak = Math.max(bw.inPerMin, bw.outPerMin, 1);
  return {
    id: "bandwidth",
    title: "Bandwidth",
    total: bw.connections,
    variant: "teal",
    href,
    rows: [
      { label: "In (snap)", value: bw.inPerMin, total: peak, color: "green" },
      { label: "Out (snap)", value: bw.outPerMin, total: peak, color: "blue" },
    ],
  };
}

function isTrialLine(createdAt: Date, expiresAt: Date) {
  const days = (expiresAt.getTime() - createdAt.getTime()) / 86400000;
  return days <= TRIAL_MAX_DAYS;
}

async function getTrialExpiringLines(
  where: Prisma.LineWhereInput,
  limit: number
): Promise<TrialLineRow[]> {
  const now = new Date();
  const lines = await prisma.line.findMany({
    where: {
      ...where,
      status: LineStatus.ACTIVE,
      expiresAt: {
        gt: now,
        lte: new Date(now.getTime() + EXPIRING_WINDOW_DAYS * 86400000),
      },
    },
    orderBy: { expiresAt: "asc" },
    take: limit * 3,
    select: {
      id: true,
      username: true,
      expiresAt: true,
      createdAt: true,
      owner: { select: { username: true } },
      magDevices: { select: { id: true }, take: 1 },
      enigmaDevices: { select: { id: true }, take: 1 },
    },
  });

  return lines
    .filter((l) => !isUnlimitedExpiry(l.expiresAt) && isTrialLine(l.createdAt, l.expiresAt))
    .slice(0, limit)
    .map((l) => ({
      id: l.id,
      username: l.username,
      expiresAt: l.expiresAt.toISOString(),
      createdAt: l.createdAt.toISOString(),
      daysLeft: Math.max(0, Math.ceil((l.expiresAt.getTime() - now.getTime()) / 86400000)),
      ownerUsername: l.owner?.username ?? null,
      deviceType: lineDeviceType(l),
    }));
}

async function getStreamHealth(): Promise<StreamHealthSummary> {
  const base = { type: StreamType.LIVE, isActive: true };
  const [totalLive, online, offlineStreams] = await Promise.all([
    prisma.stream.count({ where: base }),
    prisma.stream.count({ where: { ...base, lastProbeOk: true } }),
    prisma.stream.findMany({
      where: {
        ...base,
        OR: [{ lastProbeOk: false }, { lastProbeOk: null }],
      },
      orderBy: { name: "asc" },
      take: 10,
      select: { id: true, name: true, lastProbeError: true, lastProbeAt: true },
    }),
  ]);

  return {
    totalLive,
    online,
    offline: totalLive - online,
    offlineStreams: offlineStreams.map((s) => ({
      id: s.id,
      name: s.name,
      lastProbeError: s.lastProbeError,
      lastProbeAt: s.lastProbeAt?.toISOString() ?? null,
    })),
  };
}

async function getTicketQueue(createdById?: string): Promise<TicketQueueSummary> {
  const where = {
    status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
    ...(createdById ? { createdById } : {}),
  };

  const [open, inProgress, urgent, rows] = await Promise.all([
    prisma.ticket.count({ where: { ...where, status: TicketStatus.OPEN } }),
    prisma.ticket.count({ where: { ...where, status: TicketStatus.IN_PROGRESS } }),
    prisma.ticket.count({
      where: {
        ...where,
        priority: TicketPriority.URGENT,
      },
    }),
    prisma.ticket.findMany({
      where,
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 8,
      include: { createdBy: { select: { username: true } } },
    }),
  ]);

  return {
    open,
    inProgress,
    urgent,
    rows: rows.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      updatedAt: t.updatedAt.toISOString(),
      createdByUsername: t.createdBy.username,
    })),
  };
}

async function getTopResellers(limit: number): Promise<TopResellerRow[]> {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const resellers = await prisma.panelUser.findMany({
    where: { role: { in: [PanelRole.RESELLER, PanelRole.SUB_RESELLER] }, isActive: true },
    select: {
      id: true,
      username: true,
      _count: { select: { lines: true } },
    },
    orderBy: { lines: { _count: "desc" } },
    take: limit,
  });

  const connCounts = await prisma.liveConnection.groupBy({
    by: ["lineId"],
    where: { lastSeenAt: { gte: staleBefore } },
    _count: { lineId: true },
  });

  if (connCounts.length === 0) {
    return resellers.map((r) => ({
      userId: r.id,
      username: r.username,
      lines: r._count.lines,
      connections: 0,
    }));
  }

  const lineOwners = await prisma.line.findMany({
    where: { id: { in: connCounts.map((c) => c.lineId) } },
    select: { id: true, ownerId: true },
  });
  const ownerByLine = new Map(lineOwners.map((l) => [l.id, l.ownerId]));
  const connByOwner = new Map<string, number>();
  for (const c of connCounts) {
    const ownerId = ownerByLine.get(c.lineId);
    if (!ownerId) continue;
    connByOwner.set(ownerId, (connByOwner.get(ownerId) ?? 0) + 1);
  }

  return resellers.map((r) => ({
    userId: r.id,
    username: r.username,
    lines: r._count.lines,
    connections: connByOwner.get(r.id) ?? 0,
  }));
}

async function getLowCreditResellers(threshold: number): Promise<LowCreditRow[]> {
  const users = await prisma.panelUser.findMany({
    where: {
      role: { in: [PanelRole.RESELLER, PanelRole.SUB_RESELLER] },
      isActive: true,
      credits: { lt: threshold },
    },
    orderBy: { credits: "asc" },
    take: 10,
    select: { id: true, username: true, credits: true },
  });
  return users.map((u) => ({
    userId: u.id,
    username: u.username,
    credits: u.credits,
  }));
}

async function getBandwidthSummary(): Promise<BandwidthSummary | null> {
  const snap = await prisma.bandwidthSnapshot.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!snap) return null;
  return {
    inPerMin: Number(snap.bytesIn),
    outPerMin: Number(snap.bytesOut),
    connections: snap.connections,
  };
}

async function connectionsBreakdownForLines(lineWhere: Prisma.LineWhereInput) {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const conns = await prisma.liveConnection.findMany({
    where: { lastSeenAt: { gte: staleBefore }, line: lineWhere },
  });
  if (conns.length === 0) {
    return { total: 0, lines: 0, devices: 0, restreamers: 0 };
  }
  const lineIds = [...new Set(conns.map((c) => c.lineId))];
  const [magLines, enigmaLines] = await Promise.all([
    prisma.magDevice.findMany({ where: { lineId: { in: lineIds } }, select: { lineId: true } }),
    prisma.enigmaDevice.findMany({ where: { lineId: { in: lineIds } }, select: { lineId: true } }),
  ]);
  const deviceLineIds = new Set([
    ...magLines.map((m) => m.lineId),
    ...enigmaLines.map((e) => e.lineId),
  ]);
  let devices = 0;
  let lines = 0;
  for (const c of conns) {
    if (deviceLineIds.has(c.lineId)) devices++;
    else lines++;
  }
  return { total: conns.length, lines, devices, restreamers: 0 };
}

async function childUserIds(parentId: string): Promise<string[]> {
  const children = await prisma.panelUser.findMany({
    where: { parentId },
    select: { id: true },
  });
  return children.map((c) => c.id);
}

async function connectionsBreakdown(ownerId?: string) {
  const connections = await listActiveConnections(ownerId);
  if (connections.length === 0) {
    return { total: 0, lines: 0, devices: 0, restreamers: 0 };
  }

  const lineIds = [...new Set(connections.map((c) => c.lineId))];
  const [magLines, enigmaLines] = await Promise.all([
    prisma.magDevice.findMany({
      where: { lineId: { in: lineIds } },
      select: { lineId: true },
    }),
    prisma.enigmaDevice.findMany({
      where: { lineId: { in: lineIds } },
      select: { lineId: true },
    }),
  ]);
  const deviceLineIds = new Set([
    ...magLines.map((m) => m.lineId),
    ...enigmaLines.map((e) => e.lineId),
  ]);

  let devices = 0;
  let lines = 0;
  for (const c of connections) {
    if (deviceLineIds.has(c.lineId)) devices++;
    else lines++;
  }

  return { total: connections.length, lines, devices, restreamers: 0 };
}

async function subscriptionStats(where: Prisma.LineWhereInput) {
  const now = new Date();
  const staleBefore = new Date(Date.now() - STALE_MS);

  const [total, enabled, expired, onlineLineIds] = await Promise.all([
    prisma.line.count({ where }),
    prisma.line.count({
      where: { ...where, status: LineStatus.ACTIVE, expiresAt: { gt: now } },
    }),
    prisma.line.count({
      where: {
        ...where,
        OR: [{ status: LineStatus.EXPIRED }, { expiresAt: { lte: now } }],
      },
    }),
    prisma.liveConnection.findMany({
      where: { lastSeenAt: { gte: staleBefore }, line: where },
      select: { lineId: true },
      distinct: ["lineId"],
    }),
  ]);

  return {
    total,
    enabled,
    expired,
    online: onlineLineIds.length,
  };
}

async function creditStats(userId: string) {
  const user = await prisma.panelUser.findUnique({
    where: { id: userId },
    select: { credits: true },
  });
  const available = user?.credits ?? 0;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const usedTodayAgg = await prisma.creditTransaction.aggregate({
    where: {
      userId,
      amount: { lt: 0 },
      createdAt: { gte: startOfDay },
    },
    _sum: { amount: true },
  });
  const usedToday = Math.abs(usedTodayAgg._sum.amount ?? 0);
  const total = available + usedToday;

  return { total: total || available, available, usedToday };
}

export async function getMostWatchedByCountry(ownerId?: string): Promise<CountryWatch[]> {
  const connections = await listActiveConnections(ownerId);
  const byCountry = new Map<
    string,
    { countryCode: string; countryName: string; streams: Map<string, number> }
  >();

  for (const c of connections) {
    const ip = c.ip ? extractIpAddress(c.ip) : null;
    let countryCode = "??";
    let countryName = "Unknown";
    if (ip && isPublicIp(ip)) {
      const geo = await lookupGeoExtended(ip);
      countryCode = geo.countryCode ?? "??";
      countryName = geo.countryName ?? getCountryName(countryCode) ?? countryCode;
    }
    const streamName = c.stream?.name ?? "Unknown";
    const bucket =
      byCountry.get(countryCode) ??
      { countryCode, countryName, streams: new Map<string, number>() };
    bucket.streams.set(streamName, (bucket.streams.get(streamName) ?? 0) + 1);
    byCountry.set(countryCode, bucket);
  }

  return Array.from(byCountry.values())
    .map((c) => ({
      countryCode: c.countryCode,
      countryName: c.countryName,
      channels: [...c.streams.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    }))
    .sort((a, b) => {
      const aSum = a.channels.reduce((s, ch) => s + ch.count, 0);
      const bSum = b.channels.reduce((s, ch) => s + ch.count, 0);
      return bSum - aSum;
    })
    .slice(0, 8);
}

export async function getAdminDashboardWidgets(): Promise<DashboardWidgetsPayload> {
  const childIds = await prisma.panelUser.findMany({
    where: { role: { in: [PanelRole.RESELLER, PanelRole.SUB_RESELLER] } },
    select: { id: true },
  });
  const subOwnerIds = childIds.map((c) => c.id);
  const subLineWhere: Prisma.LineWhereInput = subOwnerIds.length
    ? { ownerId: { in: subOwnerIds } }
    : { id: "__none__" };

  const lineWhere: Prisma.LineWhereInput = {};

  const [
    mostWatchedByCountry,
    conn,
    subs,
    subConn,
    subSubs,
    expiringSummary,
    expiringLines,
    recentlyExpired,
    devices,
    newLines,
    trialExpiringLines,
    streamHealth,
    tickets,
    topResellers,
    lowCredits,
    bandwidth,
  ] = await Promise.all([
    getMostWatchedByCountry(),
    connectionsBreakdown(),
    subscriptionStats({}),
    connectionsBreakdownForLines(subLineWhere),
    subscriptionStats(subLineWhere),
    getExpiringSummary(lineWhere),
    getExpiringLineRows(lineWhere, 12, "soon"),
    getExpiringLineRows(lineWhere, 8, "recent"),
    getDeviceSummary(lineWhere),
    getNewLinesSummary(lineWhere),
    getTrialExpiringLines(lineWhere, 10),
    getStreamHealth(),
    getTicketQueue(),
    getTopResellers(8),
    getLowCreditResellers(LOW_CREDIT_THRESHOLD),
    getBandwidthSummary(),
  ]);

  const cards: SummaryCardData[] = [
    {
      id: "subscriptions",
      title: "Subscriptions",
      total: subs.total,
      variant: "green",
      href: "/admin/lines",
      rows: [
        { label: "Online", value: subs.online, total: subs.total || 1, color: "green" },
        { label: "Enabled", value: subs.enabled, total: subs.total || 1, color: "blue" },
        { label: "Expired", value: subs.expired, total: subs.total || 1, color: "red" },
      ],
    },
    {
      id: "connections",
      title: "Connections",
      total: conn.total,
      variant: "purple",
      href: "/admin/connections",
      rows: [
        { label: "Lines", value: conn.lines, total: conn.total || 1, color: "green" },
        { label: "Devices", value: conn.devices, total: conn.total || 1, color: "blue" },
        { label: "Restreamers", value: conn.restreamers, total: conn.total || 1, color: "purple" },
      ],
    },
    {
      id: "sub-subs",
      title: "Subresellers Subscriptions",
      total: subSubs.total,
      variant: "emerald",
      href: "/admin/resellers",
      rows: [
        { label: "Online", value: subSubs.online, total: subSubs.total || 1, color: "green" },
        { label: "Enabled", value: subSubs.enabled, total: subSubs.total || 1, color: "blue" },
        { label: "Expired", value: subSubs.expired, total: subSubs.total || 1, color: "red" },
      ],
    },
    {
      id: "sub-conn",
      title: "Subresellers Connections",
      total: subConn.total,
      variant: "teal",
      href: "/admin/connections",
      rows: [
        { label: "Lines", value: subConn.lines, total: subConn.total || 1, color: "green" },
        { label: "Devices", value: subConn.devices, total: subConn.total || 1, color: "blue" },
        { label: "Restreamers", value: subConn.restreamers, total: subConn.total || 1, color: "purple" },
      ],
    },
    expiringCard(expiringSummary, "/admin/lines"),
    devicesCard(devices, "/admin/mag"),
    newLinesCard(newLines, "/admin/lines"),
    streamHealthCard(streamHealth, "/admin/streams"),
    ticketsCard(tickets, "/admin/tickets"),
    ...(bandwidth ? [bandwidthCard(bandwidth, "/admin/servers")] : []),
  ];

  return {
    mostWatchedByCountry,
    cards,
    expiringLines,
    recentlyExpired,
    expiringSummary,
    devices,
    newLines,
    trialExpiringLines,
    streamHealth,
    tickets,
    topResellers,
    lowCredits,
    bandwidth,
    creditWarning: null,
    showOwner: true,
    showTopResellers: true,
    showOfflineStreams: true,
    ticketsHref: "/admin/tickets",
    streamsHref: "/admin/streams",
  };
}

export async function getResellerDashboardWidgets(
  ownerId: string
): Promise<DashboardWidgetsPayload> {
  const childIds = await childUserIds(ownerId);
  const hasChildren = childIds.length > 0;

  const ownerWhere: Prisma.LineWhereInput = { ownerId };

  const [
    mostWatchedByCountry,
    conn,
    subs,
    credits,
    subSubs,
    subConn,
    expiringSummary,
    expiringLines,
    recentlyExpired,
    devices,
    newLines,
    trialExpiringLines,
    tickets,
  ] = await Promise.all([
    getMostWatchedByCountry(ownerId),
    connectionsBreakdown(ownerId),
    subscriptionStats(ownerWhere),
    creditStats(ownerId),
    hasChildren
      ? subscriptionStats({ ownerId: { in: childIds } })
      : Promise.resolve({ total: 0, online: 0, enabled: 0, expired: 0 }),
    hasChildren
      ? connectionsBreakdownForLines({ ownerId: { in: childIds } })
      : Promise.resolve({ total: 0, lines: 0, devices: 0, restreamers: 0 }),
    getExpiringSummary(ownerWhere),
    getExpiringLineRows(ownerWhere, 12, "soon"),
    getExpiringLineRows(ownerWhere, 8, "recent"),
    getDeviceSummary(ownerWhere),
    getNewLinesSummary(ownerWhere),
    getTrialExpiringLines(ownerWhere, 10),
    getTicketQueue(ownerId),
  ]);

  const cards: SummaryCardData[] = [
    {
      id: "credits",
      title: "Credit History",
      total: credits.total,
      variant: "orange",
      href: "/reseller/credits",
      rows: [
        { label: "Available", value: credits.available, total: credits.total || 1, color: "green" },
        { label: "Used Today", value: credits.usedToday, total: credits.total || 1, color: "orange" },
      ],
    },
    {
      id: "subscriptions",
      title: "Subscriptions",
      total: subs.total,
      variant: "green",
      href: "/reseller/lines",
      rows: [
        { label: "Online", value: subs.online, total: subs.total || 1, color: "green" },
        { label: "Enabled", value: subs.enabled, total: subs.total || 1, color: "blue" },
        { label: "Expired", value: subs.expired, total: subs.total || 1, color: "red" },
      ],
    },
    {
      id: "connections",
      title: "Connections",
      total: conn.total,
      variant: "purple",
      href: "/reseller/live_connections",
      rows: [
        { label: "Lines", value: conn.lines, total: conn.total || 1, color: "green" },
        { label: "Devices", value: conn.devices, total: conn.total || 1, color: "blue" },
        { label: "Restreamers", value: conn.restreamers, total: conn.total || 1, color: "purple" },
      ],
    },
  ];

  if (hasChildren) {
    cards.push(
      {
        id: "sub-subs",
        title: "Subresellers Subscriptions",
        total: subSubs.total,
        variant: "emerald",
        href: "/reseller/users",
        rows: [
          { label: "Online", value: subSubs.online, total: subSubs.total || 1, color: "green" },
          { label: "Enabled", value: subSubs.enabled, total: subSubs.total || 1, color: "blue" },
          { label: "Expired", value: subSubs.expired, total: subSubs.total || 1, color: "red" },
        ],
      },
      {
        id: "sub-conn",
        title: "Subresellers Connections",
        total: subConn.total,
        variant: "teal",
        href: "/reseller/live_connections",
        rows: [
          { label: "Lines", value: subConn.lines, total: subConn.total || 1, color: "green" },
          { label: "Devices", value: subConn.devices, total: subConn.total || 1, color: "blue" },
          { label: "Restreamers", value: subConn.restreamers, total: subConn.total || 1, color: "purple" },
        ],
      }
    );
  }

  cards.push(
    expiringCard(expiringSummary, "/reseller/lines"),
    devicesCard(devices, "/reseller/mags"),
    newLinesCard(newLines, "/reseller/lines"),
    ticketsCard(tickets, "/reseller/tickets")
  );

  return {
    mostWatchedByCountry,
    cards,
    expiringLines,
    recentlyExpired,
    expiringSummary,
    devices,
    newLines,
    trialExpiringLines,
    streamHealth: { totalLive: 0, online: 0, offline: 0, offlineStreams: [] },
    tickets,
    topResellers: [],
    lowCredits: [],
    bandwidth: null,
    creditWarning: null,
    showOwner: false,
    showTopResellers: false,
    showOfflineStreams: false,
    ticketsHref: "/reseller/tickets",
    streamsHref: "/reseller/streams",
  };
}
