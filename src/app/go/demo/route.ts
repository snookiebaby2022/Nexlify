import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_URL,
  UTM_KEYS,
  appendUtm,
  pickUtm,
  type UtmParams,
} from "@/lib/growth-urls";

function mergeUtm(defaults: UtmParams, incoming: UtmParams): UtmParams {
  return { ...defaults, ...incoming };
}

function redirectWithUtm(request: NextRequest, defaults: UtmParams) {
  const incoming: Record<string, string | string[] | undefined> = {};
  for (const key of UTM_KEYS) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) incoming[key] = value;
  }
  const utm = mergeUtm(defaults, pickUtm(incoming));
  return NextResponse.redirect(appendUtm(`${DEMO_URL}/login`, utm, "demo"), 302);
}

export function GET(request: NextRequest) {
  return redirectWithUtm(request, {
    utm_source: "nexlify",
    utm_medium: "go",
    utm_campaign: "demo",
  });
}
