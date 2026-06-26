import { NextResponse } from "next/server";
import { requirePanelApiKey } from "@/lib/auth";
import { addonEntitlementsForPanelKey } from "@/lib/addon-entitlements";

/** Panel polls this with the activated panel license key to sync WHMCS addon entitlements. */
export async function GET(request: Request) {
  if (!requirePanelApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key")?.trim();
  if (!key) {
    return NextResponse.json({ error: "key query parameter required" }, { status: 400 });
  }

  const result = await addonEntitlementsForPanelKey(key);
  if (!result.valid) {
    return NextResponse.json({ valid: false, reason: result.reason }, { status: 404 });
  }

  return NextResponse.json(result);
}
