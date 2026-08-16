import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const checks: Record<string, string> = { app: "ok" };
  const detail: Record<string, unknown> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  try {
    const { redisPing } = await import("@/lib/redis");
    const ok = await redisPing();
    checks.redis = ok ? "ok" : "skipped";
  } catch {
    checks.redis = "skipped";
  }

  try {
    const since = new Date(Date.now() - 15 * 60_000);
    const recent = await prisma.cronRunLog.findFirst({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { job: true, status: true, createdAt: true },
    });
    checks.cron = recent ? "ok" : "stale";
    detail.cron = recent;
  } catch {
    checks.cron = "unknown";
  }

  try {
    const cutoff = new Date(Date.now() - 5 * 60_000);
    const [servers, onlineAgents, activeCdns] = await Promise.all([
      prisma.streamServer.count({ where: { isActive: true } }),
      prisma.streamServer.count({
        where: { isActive: true, agentToken: { not: null }, agentLastSeen: { gte: cutoff } },
      }),
      prisma.cdnEndpoint.count({ where: { isActive: true } }),
    ]);
    checks.edge = servers === 0 ? "none" : onlineAgents > 0 ? "ok" : "degraded";
    detail.servers = { active: servers, agentsOnline: onlineAgents, cdnEndpoints: activeCdns };
  } catch {
    checks.edge = "unknown";
  }

  const healthy = checks.database === "ok";
  const degraded =
    healthy &&
    (checks.cron === "stale" || checks.edge === "degraded" || checks.redis === "error");

  return NextResponse.json(
    {
      status: !healthy ? "degraded" : degraded ? "degraded" : "healthy",
      checks,
      detail,
      at: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
