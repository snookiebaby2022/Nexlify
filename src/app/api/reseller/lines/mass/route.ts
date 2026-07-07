import { NextRequest } from "next/server";

// Delegate to admin lines mass route
export async function POST(req: NextRequest) {
  const { POST: adminPOST } = await import("../../admin/lines/mass/route");
  return adminPOST(req);
}
