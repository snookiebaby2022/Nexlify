import { NextRequest } from "next/server";

// Delegate to admin profile route which already handles any role
export async function GET() {
  const { GET: adminGET } = await import("../../admin/profile/route");
  return adminGET();
}

export async function PATCH(req: NextRequest) {
  const { PATCH: adminPATCH } = await import("../../admin/profile/route");
  return adminPATCH(req);
}
