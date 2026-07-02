import { NextResponse } from "next/server";
import releasesJson from "@/lib/panel-releases.json";

/** Canonical release feed for customer panels (Admin → Updates). */
export async function GET() {
  return NextResponse.json(releasesJson, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
