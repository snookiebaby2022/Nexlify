import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, verifyPanelLogin } from "@/lib/auth";
import { clientIp } from "@/lib/middleware-runtime";
import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordLoginFailure,
} from "@/lib/login-rate-limit";
import { getSettingGroup } from "@/lib/panel-settings";
import { verifyTotpCode } from "@/lib/totp";
import { logActivity } from "@/lib/lines";
import { setPanelSessionOnResponse } from "@/lib/session-cookie";
import {
  verifyLicenseSessionCookie,
  verifyTrialSessionCookie,
  LICENSE_SESSION_COOKIE,
  LICENSE_TRIAL_COOKIE,
} from "@/lib/license/session-cookie";

async function panelLicensed(req: NextRequest): Promise<boolean> {
  if (process.env.NEXLIFY_LICENSE_VALID === "1") return true;
  const licenseCookie = req.cookies.get(LICENSE_SESSION_COOKIE)?.value;
  const trialCookie = req.cookies.get(LICENSE_TRIAL_COOKIE)?.value;
  if (await verifyLicenseSessionCookie(licenseCookie)) return true;
  if (await verifyTrialSessionCookie(trialCookie)) return true;
  return false;
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rate = await checkLoginRateLimit(ip);
  if (!rate.ok) {
    return NextResponse.json({ error: rate.error }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
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
  } else {
    const security = await getSettingGroup("security");
    const requireAdminTotp = security.totpRequiredForAdmins === true && user.role === "ADMIN";
    const requireResellerTotp =
      security.totpRequiredForResellers === true &&
      (user.role === "RESELLER" || user.role === "SUB_RESELLER");
    if (requireAdminTotp || requireResellerTotp) {
      return NextResponse.json(
        {
          error: "Two-factor authentication is required. Enable 2FA on your Profile page.",
          requiresTotpSetup: true,
        },
        { status: 403 }
      );
    }
  }

  const security = await getSettingGroup("security");
  const baseDays = Number(security.sessionDays ?? 7);
  const rememberMe = body.rememberMe === true || body.rememberMe === "true";
  const sessionDays = rememberMe
    ? Math.max(baseDays, 30)
    : Math.min(baseDays, 1) || 1;

  const token = await createSessionToken(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      credits: user.credits,
    },
    {
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

  const licensed = await panelLicensed(req);
  const redirect =
    user.role === "ADMIN"
      ? licensed
        ? "/admin/dashboard"
        : "/admin/license/add"
      : "/reseller/dashboard";

  const res = NextResponse.json({ ok: true, redirect, role: user.role });
  setPanelSessionOnResponse(
    res,
    token,
    req,
    Number.isFinite(sessionDays) && sessionDays > 0 ? sessionDays : 7
  );
  return res;
}
