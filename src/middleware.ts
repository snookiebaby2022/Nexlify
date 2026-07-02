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
import { jwtSecretBytes } from "@/lib/jwt-secret";
import { isIpHost, panelRedirectOriginFromRequest } from "@/lib/public-origin";
import { isPanelLicenseExempt } from "@/lib/panel-demo-host";
import {
  isPanelDemoHost,
  isDemoPlaybackPath,
  isDemoMutationAllowed,
  demoModeBlockedResponse,
} from "@/lib/panel-demo-mode";
import { prisma } from "@/lib/prisma";

function isPlaybackPath(pathname: string): boolean {
  return (
    pathname.startsWith("/live") ||
    pathname.startsWith("/movie") ||
    pathname.startsWith("/webrtc") ||
    pathname.startsWith("/get.php") ||
    pathname.startsWith("/player_api.php")
  );
}

function userAgentToDeviceType(ua: string): string {
  const lower = ua.toLowerCase();
  if (lower.includes("mag")) return "mag";
  if (lower.includes("enigma") || lower.includes("dreambox")) return "enigma";
  if (lower.includes("kodi")) return "kodi";
  if (lower.includes("smarttv") || lower.includes("tizen") || lower.includes("webos"))
    return "smarttv";
  if (lower.includes("iphone") || lower.includes("ipad") || lower.includes("ipod"))
    return "ios";
  if (lower.includes("android")) return "android";
  return "web";
}

async function enforcePlaybackRestrictions(
  req: NextRequest
): Promise<NextResponse | null> {
  const { searchParams } = req.nextUrl;
  const username = searchParams.get("username");
  const password = searchParams.get("password");
  const appPackage =
    searchParams.get("appPackage") ?? searchParams.get("app") ?? "";
  const deviceId =
    searchParams.get("device_id") ??
    searchParams.get("deviceId") ??
    searchParams.get("mac") ??
    "";
  const userAgent = req.headers.get("user-agent") ?? "";

  if (!username || !password) {
    return null;
  }

  let line = await prisma.line.findUnique({
    where: { username },
    include: { appsLocks: { include: { policy: true } } },
  });

  if (!line) {
    const code = username.trim().toUpperCase();
    if (!code) return null;
    line = await prisma.line.findFirst({
      where: { activeCode: code, authMode: "ACTIVE_CODE" },
      include: { appsLocks: { include: { policy: true } } },
    });
    if (!line) return null;
    if (password !== line.password && password !== code) return null;
  }

  // Apps Lock enforcement
  for (const lock of line.appsLocks) {
    const policy = lock.policy;
    if (!policy || !policy.isActive) continue;

    const pkg = appPackage.trim();
    const deviceType = userAgentToDeviceType(userAgent);

    if (
      policy.allowedApps.length > 0 &&
      pkg &&
      !policy.allowedApps.includes(pkg)
    ) {
      return NextResponse.json(
        { error: "App not allowed by policy" },
        { status: 403 }
      );
    }
    if (pkg && policy.blockedApps.includes(pkg)) {
      return NextResponse.json(
        { error: "App blocked by policy" },
        { status: 403 }
      );
    }
    if (
      policy.allowedAppTypes.length > 0 &&
      !policy.allowedAppTypes.includes(deviceType)
    ) {
      return NextResponse.json(
        { error: "Device type not allowed by policy" },
        { status: 403 }
      );
    }
  }

  // Device Binding enforcement
  if (line.authMode === "ACTIVE_CODE") {
    if (!deviceId) {
      return NextResponse.json(
        { error: "Device binding required: no device identifier provided" },
        { status: 403 }
      );
    }
    const binding = await prisma.deviceBinding.findUnique({
      where: { lineId_deviceId: { lineId: line.id, deviceId } },
    });
    if (!binding || binding.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Device not bound to this line" },
        { status: 403 }
      );
    }
  }

  return null;
}

/** Same-origin redirect — keeps the browser on port 80/443, never :3000. */
function panelRedirect(req: NextRequest, pathname: string): NextResponse {
  const base = panelRedirectOriginFromRequest(req.url, req.headers);
  const url = new URL(pathname, base.endsWith("/") ? base : `${base}/`);
  url.search = "";
  if (
    process.env.PANEL_BEHIND_NGINX === "1" ||
    process.env.PANEL_BEHIND_NGINX === "true"
  ) {
    url.port = "";
    if (isIpHost(url.hostname)) {
      url.protocol = "http:";
    }
  }
  return NextResponse.redirect(url);
}

function publicUrl(req: NextRequest, path: string): URL {
  const base = panelRedirectOriginFromRequest(req.url, req.headers);
  return new URL(path, base.endsWith("/") ? base : `${base}/`);
}

const COOKIE = "nexlify_session";

const PUBLIC = [
  "/login",
  "/player_api.php",
  "/get.php",
  "/xmltv.php",
  "/live",
  "/movie",
  "/api/v1",
  "/api/auth",
  "/api/billing",
  "/api/portal",
  "/portal",
  "/api/cron",
  "/api/agent",
  "/api/health",
  "/api/panel",
  "/api/public",
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

function isIpHostName(host: string): boolean {
  return isIpHost(host);
}

function isHttps(req: NextRequest): boolean {
  if (req.nextUrl.protocol === "https:") return true;
  const fwd = req.headers.get("x-forwarded-proto");
  return fwd?.split(",")[0]?.trim() === "https";
}

/** Nginx terminates TLS and forwards HTTP to :3000 — avoid HTTPS redirect loops. */
function isClientHttps(req: NextRequest): boolean {
  if (isHttps(req)) return true;
  if (isIpHostName(hostName(req))) return false;
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
    !isIpHostName(host) &&
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
    !isIpHostName(host) &&
    !PUBLIC.some((p) => pathname.startsWith(p))
  ) {
    const url = publicUrl(req, `${pathname}${req.nextUrl.search}`);
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }

  if (isPlaybackPath(pathname)) {
    const block = await enforcePlaybackRestrictions(req);
    if (block) return block;
  }

  if (PUBLIC.some((p) => pathname.startsWith(p))) {
    return applyStealthHeaders(NextResponse.next());
  }

  if (pathname === "/") {
    return applyStealthHeaders(panelRedirect(req, "/login"));
  }

  const token = req.cookies.get(COOKIE)?.value;
  if (!token) {
    return applyStealthHeaders(panelRedirect(req, "/login"));
  }

  const secret = jwtSecretBytes();
  if (!secret) {
    const res = panelRedirect(req, "/login");
    res.cookies.delete(COOKIE);
    return res;
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    if (shouldLogoutOnIpChange()) {
      const sessionIp = String(payload.clientIp ?? "");
      const current = clientIp(req);
      if (sessionIp && current && sessionIp !== current) {
        const res = panelRedirect(req, "/login");
        res.cookies.delete(COOKIE);
        return res;
      }
    }
  } catch {
    return applyStealthHeaders(panelRedirect(req, "/login"));
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
      return applyStealthHeaders(panelRedirect(req, "/admin/license/add"));
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
