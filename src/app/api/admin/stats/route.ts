import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { cacheGetOrSet } from "@/lib/cache";
import { getCacheTtls } from "@/lib/cache-ttl";
import { PanelRole } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { loadAdminDashboardStats, loadHeaderStats } from "@/lib/dashboard-stats";

/**
 * `GET /api/admin/stats` — admin panel server / dashboard statistics.
 *
 * Authentication: admin session required (`PanelRole.ADMIN`).
 * Rate limiting: via {@link guardAdminApiRequest}.
 *
 * @param req - Next.js request. Only query string is used:
 *   - `light` (`"1"` optional) — compact header payload from {@link loadHeaderStats}.
 *     Omit for the full dashboard payload from {@link loadAdminDashboardStats}.
 *
 * @returns JSON body. Cached under `stats:header` / `stats:dashboard` with TTL from
 *   {@link getCacheTtls}.
 *
 * Light (`?light=1`) shape:
 * ```json
 * {
 *   "lines": 0,
 *   "activeLines": 0,
 *   "liveStreams": 0,
 *   "onlineConnections": 0,
 *   "networkInMbps": 0,
 *   "networkOutMbps": 0,
 *   "panelProxyMbps": 0,
 *   "networkInPerMin": 0,
 *   "networkOutPerMin": 0,
 *   "networkBytesInTotal": "0",
 *   "networkBytesOutTotal": "0",
 *   "dashboard": {}
 * }
 * ```
 * (`dashboard` is omitted when the summary cache miss fails.)
 *
 * Full dashboard shape includes the light fields plus e.g. `magDevices`,
 * `cronLastRun`, `cronLogs`, `logs`, `bouquets`, `resellers`, `dashboard`,
 * `dashboardKpi`, and `serverMetrics`.
 *
 * @throws Never — HTTP errors are returned as responses:
 *   - `403` `{ "error": "Forbidden" }` when the session is missing or not admin
 *   - rate-limit response from {@link guardAdminApiRequest} when throttled
 */
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
