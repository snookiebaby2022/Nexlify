import { NextRequest } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { DELETE: adminDELETE } = await import("../../../../admin/lines/[id]/connections/route");
  return adminDELETE(req, ctx);
}
