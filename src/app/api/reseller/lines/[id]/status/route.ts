import { NextRequest } from "next/server";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const { POST: adminPOST } = await import("../../../../admin/lines/[id]/status/route");
  return adminPOST(req, ctx);
}
