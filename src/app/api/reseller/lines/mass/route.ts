import { NextRequest } from "next/server";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

// Delegate to admin lines mass route
export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const { POST: adminPOST } = await import("../../../admin/lines/mass/route");
  return adminPOST(req);
}
