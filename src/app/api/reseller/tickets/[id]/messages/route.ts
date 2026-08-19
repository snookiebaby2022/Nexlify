import { NextRequest } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { POST: adminPOST } = await import("../../../../admin/tickets/[id]/messages/route");
  return adminPOST(req, ctx);
}
