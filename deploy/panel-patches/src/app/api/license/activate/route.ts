import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  activateLicenseKey,
  storeRawKeyForOnline,
  issueLicenseSessionCookie,
  parseLicenseKey,
  normalizeLicenseKeyInput,
} from "@/lib/license";
import { licenseCookieSecure } from "@/lib/license/cookie-options";

function panelHost(req: NextRequest): string {
  const host = req.headers.get("host") ?? "localhost";
  return host.split(":")[0].toLowerCase();
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const key = normalizeLicenseKeyInput(String(body.licenseKey ?? body.key ?? ""));
  if (!key) return NextResponse.json({ error: "licenseKey required" }, { status: 400 });

  const host = panelHost(req);
  const result = await activateLicenseKey(key, host);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await storeRawKeyForOnline(key);
  const parsed = parseLicenseKey(key);
  const res = NextResponse.json({ status: result.status });
  if (parsed) {
    try {
      const { getOrCreateInstanceId } = await import("@/lib/license");
      const iid = await getOrCreateInstanceId();
      const cookie = await issueLicenseSessionCookie(parsed.payload, iid);
      res.cookies.set(cookie.name, cookie.value, {
        httpOnly: true,
        secure: licenseCookieSecure(req),
        sameSite: "lax",
        path: "/",
        maxAge: Math.max(0, parsed.payload.exp - Math.floor(Date.now() / 1000)),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not set license session cookie";
      return NextResponse.json(
        { error: msg, status: result.status, hint: "Set JWT_SECRET in .env and NEXLIFY_LICENSE_COOKIE_SECURE=0 for HTTP." },
        { status: 500 }
      );
    }
  }
  return res;
}
