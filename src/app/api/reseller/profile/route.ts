import { NextRequest } from "next/server";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

// Delegate to admin profile route which already handles any role
export async function GET() {
  const { GET: adminGET } = await import("../../admin/profile/route");
  return adminGET();
}

export async function PATCH(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const { PATCH: adminPATCH } = await import("../../admin/profile/route");
  return adminPATCH(req);
}
