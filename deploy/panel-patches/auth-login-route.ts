import { NextRequest, NextResponse } from "next/server";
import { createSession, verifyPanelLogin } from "@/lib/auth";
import { clientIp } from "@/lib/middleware-runtime";
import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordLoginFailure,
} from "@/lib/login-rate-limit";
import { getSettingGroup } from "@/lib/panel-settings";
import { verifyTotpCode } from "@/lib/totp";
import { logActivity } from "@/lib/lines";

function requestIsHttps(req: NextRequest): boolean {
  const fwd = req.headers.get("x-forwarded-proto");
  if (fwd === "https") return true;
  return req.nextUrl.protocol === "https:";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rate = await checkLoginRateLimit(ip);
  if (!rate.ok) {
    return NextResponse.json({ error: rate.error }, { status: 429 });
  }

  const body = await req.json();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  const totpCode = String(body.totpCode ?? "").trim();

  if (!username || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const user = await verifyPanelLogin(username, password);
  if (!user) {
    await recordLoginFailure(ip);
    void logActivity("panel_login_failed", {
      entity: "panel_user",
      meta: { username, ip },
    });
    return NextResponse.json({ error: "Invalid login" }, { status: 401 });
  }

  if (user.totpEnabled && user.totpSecret) {
    if (!totpCode || !verifyTotpCode(user.totpSecret, totpCode)) {
      await recordLoginFailure(ip);
      return NextResponse.json(
        { error: "Invalid or missing authenticator code", requiresTotp: true },
        { status: 401 }
      );
    }
  }

  const security = await getSettingGroup("security");
  const baseDays = Number(security.sessionDays ?? 7);
  const rememberMe = body.rememberMe === true || body.rememberMe === "true";
  const sessionDays = rememberMe
    ? Math.max(baseDays, 30)
    : Math.min(baseDays, 1) || 1;

  await createSession(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      credits: user.credits,
    },
    {
      secure: requestIsHttps(req),
      clientIp: ip,
      maxAgeDays: Number.isFinite(sessionDays) && sessionDays > 0 ? sessionDays : 7,
    }
  );

  clearLoginFailures(ip);

  void logActivity("panel_login_success", {
    userId: user.id,
    entity: "panel_user",
    entityId: user.id,
    meta: { ip, role: user.role },
  });

  const redirect =
    user.role === "ADMIN" ? "/admin/dashboard" : "/reseller/dashboard";

  return NextResponse.json({ ok: true, redirect, role: user.role });
}
