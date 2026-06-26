import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  getStoredLicense,
  getOrCreateInstanceId,
  getLicenseStatus,
  revalidateStoredLicense,
  issueLicenseSessionCookie,
  issueTrialSessionCookie,
} from "@/lib/license";
import { licenseCookieSecure } from "@/lib/license/cookie-options";

function panelHost(req: NextRequest): string {
  return (req.headers.get("host") ?? "localhost").split(":")[0].toLowerCase();
}

/** Set license or trial cookie so middleware allows /admin after Continue to dashboard. */
export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const host = panelHost(req);
  const instanceId = await getOrCreateInstanceId();
  const stored = await getStoredLicense();

  if (stored) {
    if (stored.boundInstanceId !== instanceId) {
      return NextResponse.json({ error: "Stored license belongs to another installation" }, { status: 400 });
    }
    const valid = await revalidateStoredLicense(host);
    if (!valid) {
      return NextResponse.json({ error: "Stored license is no longer valid" }, { status: 400 });
    }

    const payload = {
      v: 1 as const,
      lid: stored.lid,
      sub: stored.sub,
      tier: stored.tier,
      term: stored.tier,
      exp: stored.exp,
      iat: Math.floor(Date.now() / 1000),
    };
    const cookie = await issueLicenseSessionCookie(payload, instanceId);
    const res = NextResponse.json({ ok: true, mode: "licensed" });
    res.cookies.set(cookie.name, cookie.value, {
      httpOnly: true,
      secure: licenseCookieSecure(req),
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(0, stored.exp - Math.floor(Date.now() / 1000)),
    });
    return res;
  }

  const status = await getLicenseStatus(host);
  if (status.valid && status.trial && status.trialEndsAt) {
    const cookie = await issueTrialSessionCookie(status.trialEndsAt, instanceId);
    const res = NextResponse.json({ ok: true, mode: "trial", trialEndsAt: status.trialEndsAt });
    res.cookies.set(cookie.name, cookie.value, {
      httpOnly: true,
      secure: licenseCookieSecure(req),
      sameSite: "lax",
      path: "/",
      maxAge: cookie.maxAge,
    });
    return res;
  }

  if (status.licensed && status.valid) {
    return NextResponse.json(
      { error: "License active but session missing — activate again or contact support" },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { error: status.reason ?? "Trial expired or no license — activate a key first" },
    { status: 400 }
  );
}
