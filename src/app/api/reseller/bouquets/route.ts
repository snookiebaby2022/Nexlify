import { NextRequest } from "next/server";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const { GET: adminGET } = await import("../../admin/bouquets/route");
  return adminGET(req);
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const { POST: adminPOST } = await import("../../admin/bouquets/route");
  return adminPOST(req);
}

export async function PATCH(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const { PATCH: adminPATCH } = await import("../../admin/bouquets/route");
  return adminPATCH(req);
}

export async function DELETE(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const { DELETE: adminDELETE } = await import("../../admin/bouquets/route");
  return adminDELETE(req);
}
