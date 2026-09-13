import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;
  await destroySession();
  return NextResponse.json({ ok: true });
}
