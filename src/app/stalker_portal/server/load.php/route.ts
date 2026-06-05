import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeMac } from "@/lib/mag";
import { normalizeEnigmaMac } from "@/lib/enigma";
import { getLineByCredentials } from "@/lib/lines";
import { handleStalkerAction, resolveMacFromRequest, stalkerJsResponse } from "@/lib/stalker";
import { logStbEvent } from "@/lib/stb-events";
import { serverBaseUrl } from "@/lib/xtream";
import { getClientIp } from "@/lib/client-ip";
import {
  assertPlaybackAllowed,
  playbackDenyMessage,
  STALKER_GUARDED_ACTIONS,
} from "@/lib/playback-guard";

async function lineForMac(macRaw: string | null) {
  if (!macRaw) return null;
  const mac = normalizeMac(macRaw);
  const device = await prisma.magDevice.findUnique({
    where: { mac },
    include: {
      line: {
        include: {
          bouquets: {
            include: {
              bouquet: {
                include: {
                  streams: { include: { stream: true } },
                },
              },
            },
          },
        },
      },
    },
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
    include: {
      line: {
        include: {
          bouquets: {
            include: {
              bouquet: {
                include: {
                  streams: { include: { stream: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!device?.isActive || !device.line) return null;
  return device.line;
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const type = params.get("type");
  const action = params.get("action") ?? "";

  if (type !== "stb" && type !== "itv") {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const mac = resolveMacFromRequest(req.headers, params);
  let line = await lineForMac(mac);
  if (!line) line = await lineForEnigmaMac(mac);

  if (!line) {
    const user = params.get("login") ?? params.get("username");
    const pass = params.get("password");
    if (user && pass) line = await getLineByCredentials(user, pass);
  }

  const clientIp = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? undefined;

  if (line && STALKER_GUARDED_ACTIONS.has(action)) {
    const deny = await assertPlaybackAllowed(line, clientIp, userAgent);
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
    genre: params.get("genre") ?? "",
    category: params.get("category") ?? "",
    cmd: params.get("cmd") ?? "",
    id: params.get("id") ?? "",
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
