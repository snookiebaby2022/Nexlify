import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { GET: adminGET } = await import("../../admin/streams/route");
  return adminGET(req);
}
