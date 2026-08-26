import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Keep this route cheap. Extra table scans here compete with catalog work and make nginx time out. */
export async function GET() {
  const checks: Record<string, string> = { app: "ok" };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  try {
    const { redisPing } = await import("@/lib/redis");
    const ok = await Promise.race([
      redisPing(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 400)),
    ]);
    checks.redis = ok ? "ok" : "skipped";
  } catch {
    checks.redis = "skipped";
  }

  const healthy = checks.database === "ok";
  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      checks,
      at: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
