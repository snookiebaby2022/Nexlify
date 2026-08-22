import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { GET: adminGET } = await import("../../admin/bouquets/route");
  return adminGET(req);
}

export async function POST(req: NextRequest) {
  const { POST: adminPOST } = await import("../../admin/bouquets/route");
  return adminPOST(req);
}

export async function PATCH(req: NextRequest) {
  const { PATCH: adminPATCH } = await import("../../admin/bouquets/route");
  return adminPATCH(req);
}

export async function DELETE(req: NextRequest) {
  const { DELETE: adminDELETE } = await import("../../admin/bouquets/route");
  return adminDELETE(req);
}
