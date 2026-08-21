import { NextRequest } from "next/server";
import { handleStalkerPortalRequest } from "@/lib/stalker-portal-handle";

export async function GET(req: NextRequest) {
  return handleStalkerPortalRequest(req);
}

export async function POST(req: NextRequest) {
  return handleStalkerPortalRequest(req);
}
