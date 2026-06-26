import { NextResponse } from "next/server";
import { getCommunityLinksSettings } from "@/lib/panel-settings";

/** Public community URLs for login page (no secrets). */
export async function GET() {
  const links = await getCommunityLinksSettings();
  return NextResponse.json(links);
}
