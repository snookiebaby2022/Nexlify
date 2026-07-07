import { NextRequest } from "next/server";

// Delegate to admin lines route which already handles reseller scoping
export async function GET(req: NextRequest) {
  const { GET: adminGET } = await import("../../admin/lines/route");
  return adminGET(req);
}

export async function POST(req: NextRequest) {
  const { POST: adminPOST } = await import("../../admin/lines/route");
  return adminPOST(req);
}
