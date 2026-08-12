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
  issueLicenseSessionCookie,
  issueTrialSessionCookie,
} from "@/lib/license/session-cookie";
import {
  getStoredLicense,
  getOrCreateInstanceId,
  getLicenseStatus,
  revalidateStoredLicense,
  isEmailBoundLicense,
  licenseEmailMatches,
} from "@/lib/license";
import { licenseCookieSecure } from "@/lib/license/cookie-options";

/**
 * If the panel is licensed (or in an active trial), build the license-session
 * (or trial) cookie descriptor so the caller can drop it on the response. This
 * lets an admin land directly on the dashboard after login instead of being
 * bounced to /admin/license/add by the middleware license gate.
 * Mirrors the logic in /api/license/enter-panel.
 */
async function buildLicenseCookie(
  req: NextRequest
): Promise<{ name: string; value: string; maxAge: number } | null> {
  const host = (req.headers.get("host") ?? "localhost").split(":")[0].toLowerCase();
  const instanceId = await getOrCreateInstanceId();
  const stored = await getStoredLicense();

  if (stored) {
    if (isEmailBoundLicense() && !licenseEmailMatches(stored)) return null;
    if (!isEmailBoundLicense() && stored.boundInstanceId !== instanceId) return null;

    const valid = await revalidateStoredLicense(host);
    if (!valid) return null;

    const payload = {
      v: 1 as const,
      lid: stored.lid,
      sub: stored.sub,
      tier: stored.tier,
      term: stored.term ?? stored.tier,
      exp: stored.exp,
      iat: Math.floor(Date.now() / 1000),
    };
    const cookie = await issueLicenseSessionCookie(payload, instanceId);
    return { name: cookie.name, value: cookie.value, maxAge: Math.max(0, stored.exp - Math.floor(Date.now() / 1000)) };
  }

  const status = await getLicenseStatus(host);
  if (status.valid && status.trial && status.trialEndsAt) {
    const cookie = await issueTrialSessionCookie(status.trialEndsAt, instanceId);
    return { name: cookie.name, value: cookie.value, maxAge: cookie.maxAge };
  }

  return null;
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

  const licenseCookie = await buildLicenseCookie(req);
  const redirect =
    user.role === "ADMIN"
      ? licenseCookie
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
  if (licenseCookie) {
    res.cookies.set(licenseCookie.name, licenseCookie.value, {
      httpOnly: true,
      sameSite: "lax",
      secure: licenseCookieSecure(req),
      path: "/",
      maxAge: licenseCookie.maxAge,
    });
  }
  return res;
}
