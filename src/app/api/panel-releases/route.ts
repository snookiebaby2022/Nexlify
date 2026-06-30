import { NextResponse } from "next/server";
import { PANEL_RELEASES_FEED } from "@/lib/panel-releases-data";
import { normalizeReleasesFeed } from "@/lib/panel-releases-feed";

/** Public release notes feed for Admin → Updates, What's new modal, and nexlify.live. */
export async function GET() {
  const feed = normalizeReleasesFeed(PANEL_RELEASES_FEED as Parameters<typeof normalizeReleasesFeed>[0]);
  return NextResponse.json(feed, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
