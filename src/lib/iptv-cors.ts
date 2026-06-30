import { NextResponse } from "next/server";

/** Allow browser clients (nexlify.live/webplayer, customer sites) to call IPTV APIs. */
export const IPTV_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, User-Agent, Accept, Range",
  "Access-Control-Max-Age": "86400",
};

export function withIptvCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(IPTV_CORS_HEADERS)) {
    res.headers.set(k, v);
  }
  return res;
}

export function iptvCorsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: IPTV_CORS_HEADERS });
}

export function iptvJson(data: unknown, init?: ResponseInit): NextResponse {
  return withIptvCors(NextResponse.json(data, init));
}

export function iptvText(body: BodyInit | null, init?: ResponseInit): NextResponse {
  return withIptvCors(new NextResponse(body, init));
}
