import { NextRequest } from "next/server";

// Delegate to admin tickets route which already handles reseller scoping
export async function GET() {
  const { GET: adminGET } = await import("../../admin/tickets/route");
  return adminGET();
}

export async function POST(req: NextRequest) {
  const { POST: adminPOST } = await import("../../admin/tickets/route");
  return adminPOST(req);
}
