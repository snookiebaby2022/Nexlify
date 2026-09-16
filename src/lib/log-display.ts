import { prisma } from "@/lib/prisma";

type LogLike = {
  action?: string;
  user?: { username: string; role?: string } | null;
  line?: { username: string } | null;
  meta?: unknown;
  entity?: string | null;
  entityId?: string | null;
  userId?: string | null;
  lineId?: string | null;
};

function metaRecord(meta: unknown): Record<string, unknown> {
  return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
}

/** Best-effort operator name for audit / logs tables. */
export function resolveLogWho(log: LogLike): string {
  if (log.user?.username) return log.user.username;
  const m = metaRecord(log.meta);
  if (typeof m.username === "string" && m.username.trim()) return m.username.trim();
  if (typeof m.panelUser === "string" && m.panelUser.trim()) return m.panelUser.trim();
  if (typeof m.operator === "string" && m.operator.trim()) return m.operator.trim();
  if (log.line?.username) return log.line.username;
  if (typeof m.lineUsername === "string" && m.lineUsername.trim()) return m.lineUsername.trim();
  if (log.action?.startsWith("panel_login")) {
    const u = m.username;
    if (typeof u === "string" && u.trim()) return u.trim();
  }
  if (log.action?.startsWith("playback_") && typeof m.lineUsername === "string") {
    return m.lineUsername.trim();
  }
  return "—";
}

export function resolveLogLineUsername(log: LogLike): string | null {
  if (log.line?.username) return log.line.username;
  const m = metaRecord(log.meta);
  if (typeof m.lineUsername === "string" && m.lineUsername.trim()) return m.lineUsername.trim();
  return null;
}

export function resolveLogStreamLabel(log: LogLike): string | null {
  const m = metaRecord(log.meta);
  if (typeof m.streamName === "string" && m.streamName.trim()) return m.streamName.trim();
  if (typeof m.name === "string" && m.name.trim() && log.entity === "stream") return m.name.trim();
  if (log.entity === "stream" && log.entityId) return log.entityId;
  return null;
}

/** Attach stream names for edit_stream rows missing meta.name. */
export async function enrichActivityLogsForDisplay<
  T extends LogLike & { id?: string; streamName?: string | null; who?: string },
>(logs: T[]): Promise<T[]> {
  const streamIds = [
    ...new Set(
      logs
        .filter((l) => l.entity === "stream" && l.entityId && !resolveLogStreamLabel(l))
        .map((l) => l.entityId as string)
    ),
  ];
  const nameById = new Map<string, string>();
  if (streamIds.length) {
    const rows = await prisma.stream.findMany({
      where: { id: { in: streamIds.slice(0, 200) } },
      select: { id: true, name: true },
    });
    for (const r of rows) nameById.set(r.id, r.name);
  }

  const userIds = [
    ...new Set(
      logs
        .filter((l) => !l.user?.username && l.userId)
        .map((l) => l.userId as string)
    ),
  ];
  const userById = new Map<string, string>();
  if (userIds.length) {
    const rows = await prisma.panelUser.findMany({
      where: { id: { in: userIds.slice(0, 200) } },
      select: { id: true, username: true },
    });
    for (const r of rows) userById.set(r.id, r.username);
  }

  return logs.map((log) => {
    const who = resolveLogWho({
      ...log,
      user: log.user ?? (log.userId ? { username: userById.get(log.userId) ?? "" } : null),
    });
    let streamName = resolveLogStreamLabel(log);
    if (!streamName && log.entity === "stream" && log.entityId) {
      streamName = nameById.get(log.entityId) ?? null;
    }
    return { ...log, who, streamName };
  });
}
