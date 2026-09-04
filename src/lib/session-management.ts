import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet, cacheDelExact } from "@/lib/cache";

const SESSION_PREFIX = "session:active:";
const DEVICE_PREFIX = "session:device:";

export type SessionInfo = {
  lineId: string;
  streamId: string;
  ip: string;
  userAgent: string;
  deviceId: string | null;
  startedAt: number;
  lastHeartbeat: number;
};

export type SessionPolicy = {
  maxConnections: number;
  maxDevices: number;
  allowIpChange: boolean;
  ipChangeWindowSec: number;
  deviceBindMode: "none" | "mac" | "device_id" | "fingerprint";
  enforceConcurrentStreams: boolean;
};

function sessionKey(lineId: string): string {
  return `${SESSION_PREFIX}${lineId}`;
}

function deviceKey(lineId: string, deviceId: string): string {
  return `${DEVICE_PREFIX}${lineId}:${deviceId}`;
}

export async function getActiveSessions(lineId: string): Promise<SessionInfo[]> {
  return (await cacheGet<SessionInfo[]>(sessionKey(lineId))) ?? [];
}

export async function addSession(session: SessionInfo): Promise<void> {
  const sessions = await getActiveSessions(session.lineId);
  const existing = sessions.findIndex(
    (s) => s.ip === session.ip && s.streamId === session.streamId
  );
  if (existing >= 0) {
    sessions[existing] = session;
  } else {
    sessions.push(session);
  }
  await cacheSet(sessionKey(session.lineId), sessions, 3600);
  if (session.deviceId) {
    await cacheSet(deviceKey(session.lineId, session.deviceId), session, 3600);
  }
}

export async function removeSession(
  lineId: string,
  ip: string,
  streamId: string
): Promise<void> {
  const sessions = await getActiveSessions(lineId);
  const filtered = sessions.filter(
    (s) => !(s.ip === ip && s.streamId === streamId)
  );
  await cacheSet(sessionKey(lineId), filtered, 3600);
}

export async function heartbeatSession(
  lineId: string,
  ip: string,
  streamId: string
): Promise<void> {
  const sessions = await getActiveSessions(lineId);
  const session = sessions.find(
    (s) => s.ip === ip && s.streamId === streamId
  );
  if (session) {
    session.lastHeartbeat = Date.now();
    await cacheSet(sessionKey(lineId), sessions, 3600);
  }
}

export async function getSessionPolicy(lineId: string): Promise<SessionPolicy> {
  // Line schema currently exposes maxConnections only; other policy knobs use safe defaults
  // (legacy/planned fields are not on the Prisma model and must not be selected).
  const line = await prisma.line.findUnique({
    where: { id: lineId },
    select: {
      maxConnections: true,
      lockToIp: true,
    },
  });
  return {
    maxConnections: line?.maxConnections ?? 1,
    maxDevices: line?.maxConnections ?? 1,
    allowIpChange: line ? !line.lockToIp : true,
    ipChangeWindowSec: 300,
    deviceBindMode: "none",
    enforceConcurrentStreams: false,
  };
}

export type SessionCheckResult = {
  allowed: boolean;
  reason?: string;
  currentSessions: number;
  maxConnections: number;
};

export async function checkSessionAllowed(
  lineId: string,
  ip: string,
  streamId: string,
  deviceId?: string | null
): Promise<SessionCheckResult> {
  const [sessions, policy] = await Promise.all([
    getActiveSessions(lineId),
    getSessionPolicy(lineId),
  ]);
  const activeCount = sessions.filter(
    (s) => Date.now() - s.lastHeartbeat < 120_000
  ).length;

  if (policy.maxConnections > 0 && activeCount >= policy.maxConnections) {
    const existingFromIp = sessions.find((s) => s.ip === ip);
    if (!existingFromIp) {
      return {
        allowed: false,
        reason: "Max connections reached",
        currentSessions: activeCount,
        maxConnections: policy.maxConnections,
      };
    }
  }

  if (policy.deviceBindMode !== "none" && deviceId) {
    const deviceSessions = sessions.filter(
      (s) => s.deviceId === deviceId && s.ip !== ip
    );
    if (deviceSessions.length > 0) {
      return {
        allowed: false,
        reason: "Device already in use from another IP",
        currentSessions: activeCount,
        maxConnections: policy.maxConnections,
      };
    }
  }

  if (!policy.allowIpChange) {
    const ipChange = sessions.find(
      (s) => s.ip !== ip && Date.now() - s.lastHeartbeat < policy.ipChangeWindowSec * 1000
    );
    if (ipChange) {
      return {
        allowed: false,
        reason: `IP change not allowed within ${policy.ipChangeWindowSec}s window`,
        currentSessions: activeCount,
        maxConnections: policy.maxConnections,
      };
    }
  }

  return {
    allowed: true,
    currentSessions: activeCount,
    maxConnections: policy.maxConnections,
  };
}

export async function cleanupStaleSessions(lineId: string): Promise<number> {
  const sessions = await getActiveSessions(lineId);
  const now = Date.now();
  const staleThreshold = 180_000;
  const active = sessions.filter(
    (s) => now - s.lastHeartbeat < staleThreshold
  );
  const removed = sessions.length - active.length;
  if (removed > 0) {
    await cacheSet(sessionKey(lineId), active, 3600);
  }
  return removed;
}
