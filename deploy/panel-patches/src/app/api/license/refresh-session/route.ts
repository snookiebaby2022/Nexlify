import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  getStoredLicense,
  getOrCreateInstanceId,
  revalidateStoredLicense,
  issueLicenseSessionCookie,
} from "@/lib/license";
import { licenseCookieSecure } from "@/lib/license/cookie-options";
import { prisma } from "@/lib/prisma";

function panelHost(req: NextRequest): string {
  return (req.headers.get("host") ?? "localhost").split(":")[0].toLowerCase();
}

/** Restore license cookie when DB activation exists but browser dropped Secure cookie on HTTP. */
export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const host = panelHost(req);
  const stored = await getStoredLicense();
  if (!stored) {
    return NextResponse.json({ error: "No stored license — activate a key first" }, { status: 400 });
  }

  const instanceId = await getOrCreateInstanceId();
  if (stored.boundInstanceId !== instanceId) {
    return NextResponse.json({ error: "Stored license belongs to another installation" }, { status: 400 });
  }

  const valid = await revalidateStoredLicense(host);
  if (!valid) {
    return NextResponse.json({ error: "Stored license is no longer valid" }, { status: 400 });
  }

  const rawRow = await prisma.panelSetting.findUnique({ where: { key: "license.raw" } });
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
  const res = NextResponse.json({ ok: true, message: "License session cookie restored" });
  res.cookies.set(cookie.name, cookie.value, {
    httpOnly: true,
    secure: licenseCookieSecure(req),
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(0, stored.exp - Math.floor(Date.now() / 1000)),
  });
  void rawRow;
  return res;
}
