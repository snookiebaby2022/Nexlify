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
import { jwtSecretBytes } from "@/lib/jwt-secret";

import { parseJsonBody } from "@/lib/parse-json-body";
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
  try {
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
      return {
        name: cookie.name,
        value: cookie.value,
        maxAge: Math.max(0, stored.exp - Math.floor(Date.now() / 1000)),
      };
    }

    const status = await getLicenseStatus(host);
    if (status.valid && status.trial && status.trialEndsAt) {
      const cookie = await issueTrialSessionCookie(status.trialEndsAt, instanceId);
      return { name: cookie.name, value: cookie.value, maxAge: cookie.maxAge };
    }

    return null;
  } catch (err) {
    console.error("[auth/login] buildLicenseCookie failed:", err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);

    let rate: { ok: true } | { ok: false; error: string } = { ok: true };
    try {
      rate = await checkLoginRateLimit(ip);
    } catch (err) {
      console.error("[auth/login] rate limit check failed (continuing):", err);
    }
    if (!rate.ok) {
      return NextResponse.json({ error: rate.error }, { status: 429 });
    }

    const parsed = await parseJsonBody<{
      username?: unknown;
      password?: unknown;
      totpCode?: unknown;
      rememberMe?: unknown;
    }>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const totpCode = String(body.totpCode ?? "").trim();

    if (!username || !password) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    const user = await verifyPanelLogin(username, password);
    if (!user) {
      try {
        const fail = await recordLoginFailure(ip);
        if (fail.locked) {
          return NextResponse.json(
            { error: "Too many attempts. Try again later." },
            { status: 429 }
          );
        }
      } catch (err) {
        console.error("[auth/login] recordLoginFailure failed:", err);
      }
      void logActivity("panel_login_failed", {
        entity: "panel_user",
        meta: { username, ip },
      });
      return NextResponse.json({ error: "Invalid login" }, { status: 401 });
    }

    if (user.totpEnabled && user.totpSecret) {
      if (!totpCode || !verifyTotpCode(user.totpSecret, totpCode)) {
        try {
          await recordLoginFailure(ip);
        } catch {
          /* ignore */
        }
        return NextResponse.json(
          { error: "Invalid or missing authenticator code", requiresTotp: true },
          { status: 401 }
        );
      }
    } else {
      let security: Record<string, unknown> = {};
      try {
        security = await getSettingGroup("security");
      } catch (err) {
        console.error("[auth/login] getSettingGroup failed:", err);
      }
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

    if (!jwtSecretBytes()) {
      console.error("[auth/login] JWT_SECRET is not set");
      return NextResponse.json(
        { error: "Server misconfigured (JWT_SECRET). Run: sudo bash scripts/fix-vendor-login-500.sh" },
        { status: 503 }
      );
    }

    let security: Record<string, unknown> = {};
    try {
      security = await getSettingGroup("security");
    } catch {
      /* defaults */
    }
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

    try {
      clearLoginFailures(ip);
    } catch {
      /* ignore */
    }

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
  } catch (err) {
    console.error("[auth/login] unhandled:", err);
    const msg = err instanceof Error ? err.message : "Login failed";
    const isJwt = /JWT_SECRET/i.test(msg);
    return NextResponse.json(
      {
        error: isJwt
          ? "Server misconfigured (JWT_SECRET). Run: sudo bash scripts/fix-vendor-login-500.sh"
          : "Login failed",
        detail: process.env.NODE_ENV === "production" ? undefined : msg,
      },
      { status: isJwt ? 503 : 500 }
    );
  }
}
