import type { LineWithBouquets } from "./lines";
import { lineIsPlayable, streamsForLineExport } from "./lines";
import { StreamType } from "@prisma/client";
import { stalkerFfmpegCmd } from "./bin-tools";
export function stalkerJsResponse(data: unknown) {
  return {
    js: data,
    text: "generated in API",
    html: "",
  };
}

export async function handleStalkerAction(
  action: string,
  line: LineWithBouquets | null,
  baseUrl: string,
  extra: Record<string, string>
) {
  if (!line || !lineIsPlayable(line)) {
    return stalkerJsResponse({ error: "Account inactive", authorized: 0 });
  }

  const streams = (await streamsForLineExport(line)).filter((s) => s.type === StreamType.LIVE);

  switch (action) {
    case "handshake":
      return stalkerJsResponse({
        token: Buffer.from(`${line.id}:${Date.now()}`).toString("base64url"),
        random: Math.random().toString(36).slice(2),
        authorized: 1,
      });

    case "get_profile":
      return stalkerJsResponse({
        id: line.id,
        name: line.username,
        login: line.username,
        pass: line.password,
        parent_password: "",
        max_online: line.maxConnections,
        expires: Math.floor(line.expiresAt.getTime() / 1000),
        tariff_plan_id: "1",
        account_balance: "",
        status: 1,
      });

    case "get_main_info":
      return stalkerJsResponse({
        mac: extra.mac ?? "",
        phone: "",
        ls: "",
        version: "Nexlify Stalker Portal",
        lang: "en",
        storage_name: "",
        hd: 1,
        main_notify: 1,
        playserver: baseUrl.replace(/^https?:\/\//, ""),
        playback_limit: line.maxConnections,
        screensaver: "",
      });

    case "get_categories": {
      const cats = new Map<string, { id: string; title: string; alias: string }>();
      for (const s of streams) {
        const id = s.categoryId ?? "0";
        if (!cats.has(id)) {
          cats.set(id, { id, title: id === "0" ? "Live" : id, alias: id });
        }
      }
      return stalkerJsResponse(
        Array.from(cats.values()).map((c, i) => ({
          id: c.id,
          title: c.title,
          alias: c.alias,
          censored: 0,
          number: i + 1,
        }))
      );
    }

    case "get_ordered_list": {
      const genre = extra.genre ?? extra.category ?? "";
      const filtered = genre
        ? streams.filter((s) => (s.categoryId ?? "0") === genre)
        : streams;
      const cmds = await Promise.all(filtered.map((s) => stalkerFfmpegCmd(s.id)));
      return stalkerJsResponse({
        total_items: filtered.length,
        max_page_items: 14,
        selected_item: 0,
        cur_page: 0,
        data: filtered.map((s, i) => ({
          id: s.id,
          name: s.name,
          number: String(i + 1),
          censored: 0,
          cmd: cmds[i],
          cost: 0,
          count: 0,
          status: 1,
          hd: 1,
          tv_genre_id: s.categoryId ?? "0",
          logo: s.streamIcon ?? "",
          modified: "",
        })),
      });
    }

    case "create_link": {
      const cmd = extra.cmd ?? extra.id ?? "";
      const streamId = cmd.replace(/^ffmpeg\s+/i, "").trim();
      const stream = streams.find((s) => s.id === streamId);
      if (!stream) {
        return stalkerJsResponse({ error: "Stream not found" });
      }
      const url = `${baseUrl}/live/${line.username}/${line.password}/${stream.id}.ts`;
      return stalkerJsResponse({ cmd: url, id: stream.id });
    }

    default:
      return stalkerJsResponse({ error: `Unknown action: ${action}` });
  }
}

export function resolveMacFromRequest(
  headers: Headers,
  params: URLSearchParams
): string | null {
  const mac =
    params.get("mac") ??
    params.get("Mac") ??
    headers.get("x-mac") ??
    headers.get("cookie")?.match(/mac=([0-9A-Fa-f:]+)/i)?.[1];
  return mac ? mac : null;
}
