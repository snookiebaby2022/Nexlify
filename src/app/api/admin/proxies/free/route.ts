import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  fetchFreeProxiesLive,
  filterFreeProxiesByCountry,
  FREE_PROXY_DISCLAIMER,
} from "@/lib/free-proxies";
import { PanelRole } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const country = req.nextUrl.searchParams.get("country") ?? "all";
  const { proxies, source, error } = await fetchFreeProxiesLive();
  const filtered = filterFreeProxiesByCountry(proxies, country);

  return NextResponse.json({
    proxies: filtered,
    source,
    disclaimer: FREE_PROXY_DISCLAIMER,
    error,
    total: filtered.length,
  });
}
