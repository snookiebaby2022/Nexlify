import { NextRequest } from "next/server";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

// Delegate to admin lines route which already handles reseller scoping
export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const { GET: adminGET } = await import("../../admin/lines/route");
  return adminGET(req);
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const { POST: adminPOST } = await import("../../admin/lines/route");
  return adminPOST(req);
}
