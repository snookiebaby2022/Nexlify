/**
 * Sync classic LB live connections (MySQL/Redis via LB HTTP export) into Postgres LiveConnection.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { invalidateConnectionCaches } from "@/lib/connections";
import { notifyLiveConnectionsChanged } from "@/lib/connection-live-bus";

export type ClassicLbConnRow = {
  lineId: string;
  streamId: string;
  ip?: string;
  userAgent?: string | null;
  bytes?: number;
  lastSeenAt?: string | null;
};

function newLiveConnectionId(): string {
  return `c${Date.now().toString(36)}${randomBytes(10).toString("hex")}`;
}

function normalizeIp(ip?: string | null): string {
  return String(ip ?? "").trim();
}

export async function fetchClassicLbConnections(opts?: {
  baseUrl?: string;
  token?: string;
  staleSecs?: number;
}): Promise<ClassicLbConnRow[]> {
  const server = await getSettingGroup("server");
  const base =
    String(opts?.baseUrl ?? server.classicLbConnectionsUrl ?? "").trim() ||
    String(server.remoteLiveUpstream ?? "").trim();
  if (!base) return [];

  let origin = base;
  if (!/^https?:\/\//i.test(origin)) {
    origin = `http://${origin}`;
  }
  const u = new URL(origin.includes("://") ? origin : `http://${origin}`);
  const topo = String(server.playbackTopology ?? "");
  if (!u.port) {
    u.port = topo === "classic-lb" ? "8090" : "8080";
  }
  const stale = opts?.staleSecs ?? 90;
  const url = `${u.origin}/lb/connections.json?stale=${stale}`;

  const token =
    String(opts?.token ?? "").trim() ||
    String(process.env.CLASSIC_LB_AGENT_TOKEN ?? "").trim() ||
    String(process.env.PANEL_INTERNAL_SECRET ?? "").trim() ||
    String(process.env.AGENT_TOKEN ?? "").trim();

  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(url, { headers, signal: ac.signal, cache: "no-store" });
    if (!res.ok) return [];
    const j = (await res.json()) as { connections?: ClassicLbConnRow[] };
    return Array.isArray(j.connections) ? j.connections : [];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

export async function syncClassicLbConnectionsToPostgres(limit = 2000): Promise<number> {
  const server = await getSettingGroup("server");
  const topo = String(server.playbackTopology ?? "");
  if (topo !== "classic-lb" && process.env.NEXLIFY_CLASSIC_LB !== "1") {
    return 0;
  }

  const rows = await fetchClassicLbConnections();
  if (!rows.length) return 0;

  let synced = 0;
  const now = new Date();
  for (const row of rows) {
    if (synced >= limit) break;
    const lineId = String(row.lineId ?? "").trim();
    const streamId = String(row.streamId ?? "").trim();
    if (!lineId || !streamId) continue;
    const ip = normalizeIp(row.ip);
    const lastSeen = row.lastSeenAt ? new Date(row.lastSeenAt) : now;
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "LiveConnection" (id, "lineId", "streamId", ip, "userAgent", "startedAt", "lastSeenAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT ("lineId", "streamId", ip)
         DO UPDATE SET "lastSeenAt" = EXCLUDED."lastSeenAt",
           "userAgent" = COALESCE(EXCLUDED."userAgent", "LiveConnection"."userAgent")`,
        newLiveConnectionId(),
        lineId,
        streamId,
        ip,
        row.userAgent ?? null,
        lastSeen,
        lastSeen
      );
      synced += 1;
    } catch {
      try {
        await prisma.liveConnection.upsert({
          where: { lineId_streamId_ip: { lineId, streamId, ip } },
          create: {
            lineId,
            streamId,
            ip,
            userAgent: row.userAgent ?? null,
            lastSeenAt: lastSeen,
          },
          update: { lastSeenAt: lastSeen, userAgent: row.userAgent ?? undefined },
        });
        synced += 1;
      } catch {
        /* skip bad row */
      }
    }
  }

  if (synced > 0) {
    invalidateConnectionCaches();
    notifyLiveConnectionsChanged();
  }
  return synced;
}
