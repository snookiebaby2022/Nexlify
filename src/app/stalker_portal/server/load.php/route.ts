import { NextRequest, NextResponse } from "next/server";
import {
  handleStalkerPortalRequest,
  isPortalDocumentNavigation,
} from "@/lib/stalker-portal-handle";

export async function GET(req: NextRequest) {
  if (isPortalDocumentNavigation(req)) {
    return NextResponse.redirect(new URL("/c/", req.url), 302);
  }
  return handleStalkerPortalRequest(req);
}

export async function POST(req: NextRequest) {
  return handleStalkerPortalRequest(req);
}
