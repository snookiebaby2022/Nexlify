import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeEnigmaMac } from "@/lib/enigma";
import { getLineByCredentials, lineAuthInclude, type LineWithBouquets } from "@/lib/lines";
import { getClientIp } from "@/lib/client-ip";
import {
  asPlaybackGuardLine,
  assertPlaybackAllowed,
} from "@/lib/playback-guard";
import {
  xtreamLiveCategoriesForLine,
  xtreamLiveStreams,
  xtreamVodCategoriesForLine,
  xtreamVodStreams,
  xtreamSeriesCategoriesForLine,
} from "@/lib/xtream";
import { mergeXtreamRequestParams } from "@/lib/xtream-request-params";

function b64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

function xmlEscape(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapItems(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<items>\n${inner}</items>`;
}

async function resolveEnigmaLine(params: URLSearchParams): Promise<LineWithBouquets | null> {
  const macRaw = params.get("mac") ?? params.get("device_id");
  if (macRaw) {
    const mac = normalizeEnigmaMac(macRaw);
    if (!mac) return null;
    const device = await prisma.enigmaDevice.findUnique({
      where: { mac },
      include: { line: { include: lineAuthInclude } },
    });
    if (!device?.isActive || !device.line) return null;
    return device.line;
  }
  const username = params.get("username") ?? params.get("user");
  const password = params.get("password") ?? params.get("pass");
  if (!username || !password) return null;
  return getLineByCredentials(username, password);
}

function categoryItems(
  rows: { category_id: string | number; category_name: string }[],
): string {
  return rows
    .map(
      (c) =>
        `  <item>\n    <title>${b64(c.category_name)}</title>\n    <category_id>${xmlEscape(String(c.category_id))}</category_id>\n  </item>`,
    )
    .join("\n");
}

function streamItems(
  rows: { name: string; stream_id: number; stream_icon?: string; category_id?: string | number }[],
  hostBase: string,
  line: LineWithBouquets,
): string {
  return rows
    .map((s) => {
      const ext = "ts";
      const url = `${hostBase}/live/${encodeURIComponent(line.username)}/${encodeURIComponent(line.password)}/${s.stream_id}.${ext}`;
      return `  <item>\n    <title>${b64(s.name)}</title>\n    <stream_id>${s.stream_id}</stream_id>\n    <stream_icon>${xmlEscape(String(s.stream_icon ?? ""))}</stream_icon>\n    <category_id>${xmlEscape(String(s.category_id ?? ""))}</category_id>\n    <stream_url>${xmlEscape(url)}</stream_url>\n  </item>`;
    })
    .join("\n");
}

export async function handleEnigma2Request(req: NextRequest): Promise<Response> {
  const params =
    req.method === "POST" ? await mergeXtreamRequestParams(req) : req.nextUrl.searchParams;
  const type = (params.get("type") ?? "").trim().toLowerCase();

  const line = await resolveEnigmaLine(params);
  if (!line) {
    return new Response(wrapItems(""), {
      status: 401,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }

  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent") ?? undefined;
  const deny = await assertPlaybackAllowed(asPlaybackGuardLine(line), ip, ua, { listingOnly: true });
  if (deny) {
    return new Response(wrapItems(""), {
      status: 403,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const hostBase = `${proto}://${host}`.replace(/\/+$/, "");

  switch (type) {
    case "get_live_categories": {
      const cats = await xtreamLiveCategoriesForLine(line, false);
      return new Response(wrapItems(categoryItems(cats)), {
        headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "private, max-age=60" },
      });
    }
    case "get_vod_categories": {
      const cats = await xtreamVodCategoriesForLine(line, false);
      return new Response(wrapItems(categoryItems(cats)), {
        headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "private, max-age=60" },
      });
    }
    case "get_series_categories": {
      const cats = await xtreamSeriesCategoriesForLine(line, false);
      return new Response(wrapItems(categoryItems(cats)), {
        headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "private, max-age=60" },
      });
    }
    case "get_live_streams": {
      const catId = params.get("cat_id") ?? params.get("category_id") ?? undefined;
      const streams = await xtreamLiveStreams(line, hostBase, catId);
      return new Response(wrapItems(streamItems(streams, hostBase, line)), {
        headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "private, max-age=60" },
      });
    }
    case "get_vod_streams": {
      const catId = params.get("cat_id") ?? params.get("category_id") ?? undefined;
      const vod = await xtreamVodStreams(line, hostBase, catId);
      const inner = vod
        .map((s) => {
          const id = s.stream_id;
          const ext = String(s.container_extension ?? "mp4");
          const url = `${hostBase}/movie/${encodeURIComponent(line.username)}/${encodeURIComponent(line.password)}/${id}.${ext}`;
          return `  <item>\n    <title>${b64(String(s.name))}</title>\n    <stream_id>${id}</stream_id>\n    <stream_icon>${xmlEscape(String(s.stream_icon ?? ""))}</stream_icon>\n    <category_id>${xmlEscape(String(s.category_id ?? ""))}</category_id>\n    <stream_url>${xmlEscape(url)}</stream_url>\n  </item>`;
        })
        .join("\n");
      return new Response(wrapItems(inner), {
        headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "private, max-age=60" },
      });
    }
    case "get_series": {
      const { xtreamSeriesForLine } = await import("@/lib/xtream");
      const catId = params.get("cat_id") ?? params.get("category_id") ?? undefined;
      const series = await xtreamSeriesForLine(line, catId);
      const inner = series
        .map(
          (s) =>
            `  <item>\n    <title>${b64(String(s.name))}</title>\n    <series_id>${s.series_id}</series_id>\n    <category_id>${xmlEscape(String(s.category_id ?? ""))}</category_id>\n  </item>`,
        )
        .join("\n");
      return new Response(wrapItems(inner), {
        headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "private, max-age=60" },
      });
    }
    default:
      return new Response(wrapItems(""), {
        status: 400,
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      });
  }
}
