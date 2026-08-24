import { NextRequest, NextResponse } from "next/server";
import { enforceAdminApiRateLimit } from "@/lib/api-rate-limit";

/**
 * Call at the top of sensitive admin/reseller API routes for Redis-backed
 * rate limiting (middleware uses a lighter in-memory guard).
 */
export async function guardAdminApiRequest(req: NextRequest): Promise<NextResponse | null> {
  return enforceAdminApiRateLimit(req);
}
