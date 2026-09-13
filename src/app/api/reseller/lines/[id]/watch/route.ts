import { NextRequest } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { GET: adminGET } = await import("../../../../admin/lines/[id]/watch/route");
  return adminGET(req, ctx);
}
