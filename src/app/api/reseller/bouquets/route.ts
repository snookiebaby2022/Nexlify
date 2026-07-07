import { NextRequest } from "next/server";

// Delegate to admin bouquets route which already handles reseller scoping
export async function GET(req: NextRequest) {
  const { GET: adminGET } = await import("../../admin/bouquets/route");
  return adminGET(req);
}
