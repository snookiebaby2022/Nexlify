import { NextRequest } from "next/server";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const { GET: adminGET } = await import("../../../admin/lines/[id]/route");
  return adminGET(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const { PATCH: adminPATCH } = await import("../../../admin/lines/[id]/route");
  return adminPATCH(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const { DELETE: adminDELETE } = await import("../../../admin/lines/[id]/route");
  return adminDELETE(req, ctx);
}
