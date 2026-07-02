import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizedInternalRequest } from "@/lib/internal-request";
import {
  issueLicenseSessionCookie,
  parseLicenseKey,
  getOrCreateInstanceId,
} from "@/lib/license";
import { licenseCookieSecure } from "@/lib/license/cookie-options";
import { applyRemoteLicenseAction } from "@/lib/license/remote-sync";

function panelHost(req: NextRequest): string {
  const host = req.headers.get("host") ?? "localhost";
  return host.split(":")[0].toLowerCase();
}

const bodySchema = z.object({
  action: z.enum(["activate", "replace", "revoke", "suspend", "unsuspend", "delete"]),
  licenseKey: z.string().optional(),
});

/** Vendor admin pushes license add / renew / revoke / suspend to this panel. */
export async function POST(req: NextRequest) {
  if (!isAuthorizedInternalRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = bodySchema.parse(await req.json());
    const host = panelHost(req);
    const result = await applyRemoteLicenseAction(body.action, body.licenseKey, host);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    const res = NextResponse.json({ ok: true });
    if ((body.action === "activate" || body.action === "replace") && body.licenseKey) {
      const parsed = parseLicenseKey(body.licenseKey);
      if (parsed) {
        try {
          const iid = await getOrCreateInstanceId();
          const cookie = await issueLicenseSessionCookie(parsed.payload, iid);
          res.cookies.set(cookie.name, cookie.value, {
            httpOnly: true,
            secure: licenseCookieSecure(req),
            sameSite: "lax",
            path: "/",
            maxAge: Math.max(0, parsed.payload.exp - Math.floor(Date.now() / 1000)),
          });
        } catch {
          /* cookie optional — license state is stored in DB */
        }
      }
    }
    return res;
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
