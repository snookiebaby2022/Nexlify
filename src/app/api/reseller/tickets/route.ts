import { NextRequest } from "next/server";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

// Delegate to admin tickets route which already handles reseller scoping
export async function GET() {
  const { GET: adminGET } = await import("../../admin/tickets/route");
  return adminGET();
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const { POST: adminPOST } = await import("../../admin/tickets/route");
  return adminPOST(req);
}
