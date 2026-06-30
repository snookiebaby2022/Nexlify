import { NextRequest, NextResponse } from "next/server";
import { getWhiteLabelForUsername } from "@/lib/reseller-white-label";

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username")?.trim();
  if (!username) {
    return NextResponse.json({ whiteLabel: null });
  }
  const whiteLabel = await getWhiteLabelForUsername(username);
  return NextResponse.json({ whiteLabel });
}
