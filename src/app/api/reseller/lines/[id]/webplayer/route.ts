import { NextRequest } from "next/server";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { POST: adminPOST } = await import("../../../../admin/lines/[id]/webplayer/route");
  return adminPOST(req, ctx);
}
