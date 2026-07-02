import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { invalidateAllCache } from "@/lib/cache-invalidate";
import { redisPing, redisModeFromEnv } from "@/lib/redis";
import { getSettingGroup } from "@/lib/panel-settings";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const redis = await redisPing();
  const cacheSettings = await getSettingGroup("cache");
  return NextResponse.json({
    redis,
    redisMode: redisModeFromEnv(),
    recommendedMode: cacheSettings.redisMode ?? "single",
    redisUrl: process.env.REDIS_URL
      ? "configured"
      : process.env.REDIS_CLUSTER_NODES
        ? "cluster nodes configured"
        : "not set (using memory cache)",
  });
}

export async function POST() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const started = Date.now();
  const deleted = await invalidateAllCache();
  return NextResponse.json({ ok: true, deleted, ms: Date.now() - started });
}
