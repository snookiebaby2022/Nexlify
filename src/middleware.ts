import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** No-op — markdown rewrites live in next.config.ts rewrites(). */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
