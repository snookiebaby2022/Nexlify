import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const checks: Record<string, string> = { app: "ok" };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  try {
    const { getRedis } = await import("@/lib/redis");
    const redis = await getRedis();
    if (redis) {
      await redis.ping();
      checks.redis = "ok";
    } else {
      checks.redis = "skipped";
    }
  } catch {
    checks.redis = "error";
  }

  const healthy = checks.database === "ok";
  return NextResponse.json(
    { status: healthy ? "healthy" : "degraded", checks, at: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  );
}
