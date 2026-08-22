import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeMac } from "@/lib/mag";
import { normalizeEnigmaMac } from "@/lib/enigma";
import { getLineByCredentials, lineAuthInclude, type LineWithBouquets } from "@/lib/lines";
import { handleStalkerAction, resolveMacFromRequest, stalkerJsResponse } from "@/lib/stalker";
import { logStbEvent } from "@/lib/stb-events";
import { serverBaseUrl } from "@/lib/xtream";
import { getClientIp } from "@/lib/client-ip";
import { rejectDemoIptvPlayback } from "@/lib/iptv-route-guard";
import {
  asPlaybackGuardLine,
  assertPlaybackAllowed,
  playbackDenyMessage,
  STALKER_GUARDED_ACTIONS,
} from "@/lib/playback-guard";

async function lineForMac(macRaw: string | null) {
  if (!macRaw) return null;
  const mac = normalizeMac(macRaw);
  if (!mac) return null;
  const device = await prisma.magDevice.findUnique({
    where: { mac },
    include: { line: { include: lineAuthInclude } },
  });
  if (!device?.isActive || !device.line) return null;
  return device.line;
}

async function lineForEnigmaMac(macRaw: string | null) {
  if (!macRaw) return null;
  const mac = normalizeEnigmaMac(macRaw);
  if (!mac) return null;
  const device = await prisma.enigmaDevice.findUnique({
    where: { mac },
    include: { line: { include: lineAuthInclude } },
  });
  if (!device?.isActive || !device.line) return null;
  return device.line;
}

export function isStalkerPortalRequest(req: NextRequest): boolean {
  const params = req.nextUrl.searchParams;
  const type = params.get("type");
  if (type === "stb" || type === "itv" || type === "vod" || type === "series") return true;
  if (params.get("action")) return true;
  if (params.get("JsHttpRequest")) return true;
  if (resolveMacFromRequest(req.headers, params)) return true;
  return req.method === "POST";
}

/** MAG / StbEmu / Enigma middleware clients (not a desktop browser opening /c/ for docs). */
export function isStbClient(req: NextRequest): boolean {
  const ua = (req.headers.get("user-agent") ?? "").toLowerCase();
  if (
    /stbemu|stbapp|mag\d{3}|infomir|stalker|dvb|android.?tv|portalclient|tvip/i.test(
      ua
    )
  ) {
    return true;
  }
  if (req.headers.get("x-user-agent")) return true;
  if (resolveMacFromRequest(req.headers, req.nextUrl.searchParams)) return true;
  return false;
}

/** Browser navigated to JSON API URL in a WebView tab — never redirect real Stalker API calls. */
export function isPortalDocumentNavigation(req: NextRequest): boolean {
  if (req.method !== "GET") return false;
  if (req.nextUrl.searchParams.get("JsHttpRequest")) return false;
  if (req.headers.get("x-requested-with") === "XMLHttpRequest") return false;
  const dest = req.headers.get("sec-fetch-dest");
  return dest === "document" || dest === "iframe";
}

/** Merge query string with urlencoded POST fields (StbEmu sends MAC in POST body). */
async function portalSearchParams(req: NextRequest): Promise<URLSearchParams> {
  const params = new URLSearchParams(req.nextUrl.searchParams);
  if (req.method !== "POST") return params;

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/x-www-form-urlencoded")) return params;

  try {
    const text = await req.text();
    if (!text) return params;
    const post = new URLSearchParams(text);
    post.forEach((value, key) => {
      if (!params.has(key)) params.set(key, value);
    });
  } catch {
    /* ignore malformed body */
  }
  return params;
}

/** Handle MAG / Enigma2 Stalker portal API (load.php and /c/). */
export async function handleStalkerPortalRequest(req: NextRequest): Promise<NextResponse> {
  const demoBlock = rejectDemoIptvPlayback(req);
  if (demoBlock) return demoBlock;

  const params = await portalSearchParams(req);
  let type = params.get("type");
  let action = params.get("action") ?? "";

  if (type !== "stb" && type !== "itv" && type !== "vod" && type !== "series" && !action) {
    if (isStbClient(req) || resolveMacFromRequest(req.headers, params)) {
      type = "stb";
      action = "handshake";
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
  }

  const mac = resolveMacFromRequest(req.headers, params);
  let line: LineWithBouquets | null = await lineForMac(mac);
  if (!line) line = await lineForEnigmaMac(mac);

  if (!line) {
    const user = params.get("login") ?? params.get("username");
    const pass = params.get("password");
    if (user && pass) line = await getLineByCredentials(user, pass);
  }

  const clientIp = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? undefined;

  if (line && STALKER_GUARDED_ACTIONS.has(action)) {
    const listingOnly = action !== "create_link";
    const cmdRaw = params.get("cmd") ?? "";
    const createLinkStreamId =
      action === "create_link"
        ? cmdRaw.replace(/^ffmpeg\s+/i, "").replace(/^series:/i, "").trim()
        : "";
    const deny = await assertPlaybackAllowed(asPlaybackGuardLine(line), clientIp, userAgent, {
      listingOnly,
      streamId: createLinkStreamId || undefined,
    });
    if (deny) {
      const msg = playbackDenyMessage(deny);
      void logStbEvent({
        deviceType: "stalker",
        mac: mac ?? undefined,
        lineId: line.id,
        event: `denied_${action}`,
        meta: { reason: deny, ip: clientIp },
      });
      return NextResponse.json(
        stalkerJsResponse({
          authorized: 0,
          error: msg,
          ...(action === "handshake" ? { token: null } : {}),
        })
      );
    }
  }

  const baseUrl = serverBaseUrl(req.url, req.headers);
  const body = await handleStalkerAction(action, line, baseUrl, {
    mac: mac ?? "",
    portalType: type ?? "stb",
    clientIp: clientIp ?? "",
    page: params.get("p") ?? params.get("page") ?? "0",
    genre: params.get("genre") ?? "",
    category: params.get("category") ?? "",
    cmd: params.get("cmd") ?? "",
    id: params.get("id") ?? "",
    movie_id: params.get("movie_id") ?? "",
    series_id: params.get("series_id") ?? "",
    stream_id: params.get("stream_id") ?? "",
  });

  if (line && action) {
    void logStbEvent({
      deviceType: "stalker",
      mac: mac ?? undefined,
      lineId: line.id,
      event: action,
      meta: { portalType: type ?? "" },
    });
  }

  return NextResponse.json(body);
}
