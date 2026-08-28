import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { cacheGetOrSet } from "@/lib/cache";
import { getCacheTtls } from "@/lib/cache-ttl";
import { PanelRole } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { loadAdminDashboardStats, loadHeaderStats } from "@/lib/dashboard-stats";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const light = req.nextUrl.searchParams.get("light") === "1";
  const ttl = await getCacheTtls();
  if (light) {
    const stats = await cacheGetOrSet("stats:header", ttl.stats, loadHeaderStats);
    return NextResponse.json(stats);
  }
  const stats = await cacheGetOrSet("stats:dashboard", ttl.stats, loadAdminDashboardStats);
  return NextResponse.json(stats);
}
