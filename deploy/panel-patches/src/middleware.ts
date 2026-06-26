import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { normalizeDomain } from "@/lib/domains-host";
import {
  clientIp,
  resolveAllowedHosts,
  shouldBlockBots,
  shouldLogoutOnIpChange,
  shouldStealthPanel,
} from "@/lib/middleware-runtime";
import {
  botBlockedBody,
  isLikelyBot,
  shouldStealthPath,
  stealthResponseHeaders,
} from "@/lib/bot-stealth";
import {
  verifyLicenseSessionCookie,
  verifyTrialSessionCookie,
  LICENSE_SESSION_COOKIE,
  LICENSE_TRIAL_COOKIE,
} from "@/lib/license/session-cookie";
import { publicOriginFromRequest } from "@/lib/public-origin";
import { isPanelLicenseExempt } from "@/lib/panel-demo-host";
import {
  isPanelDemoHost,
  isDemoPlaybackPath,
  isDemoMutationAllowed,
  demoModeBlockedResponse,
} from "@/lib/panel-demo-mode";

function publicUrl(req: NextRequest, path: string): URL {
  const base = publicOriginFromRequest(req.url, req.headers);
  return new URL(path, base.endsWith("/") ? base : `${base}/`);
}

const COOKIE = "nexlify_session";

const PUBLIC = [
  "/login",
  "/player_api.php",
  "/get.php",
  "/live",
  "/api/v1",
  "/api/auth",
  "/api/billing",
  "/api/cron",
  "/api/agent",
  "/api/health",
  "/api/panel",
  "/api/license",
  "/api/internal",
  "/stalker_portal",
  "/c",
  "/portal.php",
];

function hostName(req: NextRequest): string {
  const host = req.headers.get("host") ?? "";
  return host.split(":")[0].toLowerCase();
}

function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isIpHost(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

function isHttps(req: NextRequest): boolean {
  if (req.nextUrl.protocol === "https:") return true;
  const fwd = req.headers.get("x-forwarded-proto");
  return fwd?.split(",")[0]?.trim() === "https";
}

/** Nginx terminates TLS and forwards HTTP to :3000 — avoid HTTPS redirect loops. */
function isClientHttps(req: NextRequest): boolean {
  if (isHttps(req)) return true;
  const assume =
    process.env.PANEL_ASSUME_PROXY_SSL !== "0" &&
    process.env.PANEL_ASSUME_PROXY_SSL !== "false";
  if (!assume) return false;
  return Boolean(
    req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-host")
  );
}

function applyStealthHeaders(res: NextResponse): NextResponse {
  if (!shouldStealthPanel()) return res;
  for (const [k, v] of Object.entries(stealthResponseHeaders())) {
    res.headers.set(k, v);
  }
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (shouldBlockBots() && shouldStealthPath(pathname) && isLikelyBot(req)) {
    return new NextResponse(botBlockedBody(), {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...stealthResponseHeaders(),
      },
    });
  }

  const host = hostName(req);

  if (isPanelDemoHost(host)) {
    if (isDemoPlaybackPath(pathname)) {
      return demoModeBlockedResponse("playback");
    }
    if (!isDemoMutationAllowed(pathname, req.method)) {
      return demoModeBlockedResponse("mutation");
    }
  }

  const primary = process.env.PANEL_PRIMARY_DOMAIN
    ? normalizeDomain(process.env.PANEL_PRIMARY_DOMAIN)
    : "";
  const allowed = resolveAllowedHosts();
  const forceHttps =
    process.env.PANEL_FORCE_HTTPS === "1" ||
    process.env.PANEL_FORCE_HTTPS === "true" ||
    process.env.PANEL_FULL_SSL === "1";

  if (
    primary &&
    host &&
    !isLocalHost(host) &&
    !isIpHost(host) &&
    !allowed.has(host) &&
    !PUBLIC.some((p) => pathname.startsWith(p))
  ) {
    const url = publicUrl(req, `${pathname}${req.nextUrl.search}`);
    url.hostname = primary;
    if (forceHttps) url.protocol = "https:";
    const behindNginx =
      process.env.PANEL_BEHIND_NGINX === "1" || process.env.PANEL_BEHIND_NGINX === "true";
    const envPort = process.env.PANEL_PUBLIC_PORT ?? process.env.PANEL_PORT ?? process.env.PORT;
    if (!behindNginx && envPort && envPort !== "80" && envPort !== "443") url.port = envPort;
    return NextResponse.redirect(url, 308);
  }

  if (
    forceHttps &&
    !isClientHttps(req) &&
    !isLocalHost(host) &&
    !isIpHost(host) &&
    !PUBLIC.some((p) => pathname.startsWith(p))
  ) {
    const url = publicUrl(req, `${pathname}${req.nextUrl.search}`);
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }

  if (PUBLIC.some((p) => pathname.startsWith(p))) {
    return applyStealthHeaders(NextResponse.next());
  }

  if (pathname === "/") {
    return applyStealthHeaders(NextResponse.redirect(publicUrl(req, "/login")));
  }

  const token = req.cookies.get(COOKIE)?.value;
  if (!token) {
    return NextResponse.redirect(publicUrl(req, "/login"));
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me");
    const { payload } = await jwtVerify(token, secret);
    if (shouldLogoutOnIpChange()) {
      const sessionIp = String(payload.clientIp ?? "");
      const current = clientIp(req);
      if (sessionIp && current && sessionIp !== current) {
        const res = NextResponse.redirect(publicUrl(req, "/login"));
        res.cookies.delete(COOKIE);
        return res;
      }
    }
  } catch {
    return NextResponse.redirect(publicUrl(req, "/login"));
  }

  const isAdminArea = pathname.startsWith("/admin") || pathname.startsWith("/reseller");
  if (isAdminArea) {
    const licenseSkip = isPanelLicenseExempt(host);
    const envLicensed = process.env.NEXLIFY_LICENSE_VALID === "1";
    const licenseCookie = req.cookies.get(LICENSE_SESSION_COOKIE)?.value;
    const trialCookie = req.cookies.get(LICENSE_TRIAL_COOKIE)?.value;
    const licensed =
      licenseSkip ||
      envLicensed ||
      (await verifyLicenseSessionCookie(licenseCookie)) ||
      (await verifyTrialSessionCookie(trialCookie));

    if (!licensed) {
      if (
        pathname.startsWith("/admin/license") ||
        pathname.startsWith("/api/license")
      ) {
        return NextResponse.next();
      }
      return NextResponse.redirect(publicUrl(req, "/admin/license"));
    }
  }

  const res = applyStealthHeaders(NextResponse.next());
  if (process.env.PANEL_FULL_SSL === "1") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|php)$).*)"],
};
