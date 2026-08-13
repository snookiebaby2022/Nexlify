import type { LineWithBouquets } from "./lines";
import { lineIsPlayable, streamsForLineExport } from "./lines";
import { StreamType } from "@prisma/client";
import { stalkerFfmpegCmd } from "./bin-tools";
import { prisma } from "./prisma";
import { expandCategoryFilter } from "./category-tree";

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
      const categoryIds = [
        ...new Set(streams.map((s) => s.categoryId).filter(Boolean) as string[]),
      ];
      const cats = categoryIds.length
        ? await prisma.category.findMany({
            where: { id: { in: categoryIds } },
            select: { id: true, name: true, sortOrder: true, isAdult: true },
            orderBy: { sortOrder: "asc" },
          })
        : [];
      const byId = new Map(cats.map((c) => [c.id, c]));
      const rows: { id: string; title: string; alias: string; censored: number; number: number }[] =
        [];
      let n = 1;
      if (streams.some((s) => !s.categoryId)) {
        rows.push({ id: "0", title: "Live", alias: "0", censored: 0, number: n++ });
      }
      for (const c of cats) {
        rows.push({
          id: c.id,
          title: c.name,
          alias: c.id,
          censored: c.isAdult ? 1 : 0,
          number: n++,
        });
      }
      // Include any orphan category ids as last resort
      for (const id of categoryIds) {
        if (!byId.has(id) && !rows.some((r) => r.id === id)) {
          rows.push({ id, title: id, alias: id, censored: 0, number: n++ });
        }
      }
      return stalkerJsResponse(rows);
    }

    case "get_ordered_list": {
      const genre = extra.genre ?? extra.category ?? "";
      let filtered = streams;
      if (genre) {
        if (genre === "0") {
          filtered = streams.filter((s) => !s.categoryId);
        } else {
          const allowed = new Set(await expandCategoryFilter(genre));
          filtered = streams.filter((s) => s.categoryId && allowed.has(s.categoryId));
        }
      }
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
