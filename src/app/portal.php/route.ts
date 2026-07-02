import { NextRequest, NextResponse } from "next/server";

/** Legacy Xtream/MAG bookmark — redirect to subscriber portal. */
export async function GET(req: NextRequest) {
  const url = new URL("/portal", req.nextUrl.origin);
  return NextResponse.redirect(url, 308);
}
