import fs from "fs";
import path from "path";
import { parseM3u, guessStreamType, type M3uEntry } from "./m3u-parser";
import { prisma } from "./prisma";
import { StreamType, VodMode } from "@prisma/client";
import { resolveProviderUrl } from "./vod-provider-url";
import {
  categoryForMovie,
  categoryForSeries,
  categoryFromFolderPath,
  categoryFromGroupName,
} from "./vod-category";
import { clearTmdbImportCache, enrichVodFromTmdb } from "./vod-tmdb-enrich";

const VIDEO_EXT = new Set([
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".wmv",
  ".m4v",
  ".ts",
  ".m3u8",
]);

export function resolveSafePath(inputPath: string, allowedRoot?: string) {
  const resolved = path.resolve(inputPath);
  if (!allowedRoot) return resolved;
  const root = path.resolve(allowedRoot);
  if (!resolved.startsWith(root)) {
    throw new Error(`Path must be under ${root}`);
  }
  return resolved;
}

export function fileUrlForPath(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`;
}

export function getMediaImportRoot() {
  return process.env.MEDIA_IMPORT_ROOT ?? "/media";
}

function sanitizeSegment(name: string) {
  return name.replace(/[^\w.\- ()[\]]+/g, "_").replace(/_+/g, "_").slice(0, 120);
}

export function buildMovieRelativePath(title: string, ext: string) {
  const base = sanitizeSegment(title) || "movie";
  return path.join("movies", `${base}${ext.startsWith(".") ? ext : `.${ext}`}`);
}

export function buildSeriesRelativePath(
  seriesName: string,
  seasonNum: number,
  episodeNum: number,
  ext: string
) {
  const show = sanitizeSegment(seriesName) || "series";
  const season = String(seasonNum).padStart(2, "0");
  const episode = String(episodeNum).padStart(2, "0");
  const suffix = ext.startsWith(".") ? ext : `.${ext}`;
  return path.join(
    "series",
    show,
    `Season ${season}`,
    `${show}.S${season}E${episode}${suffix}`
  );
}

export async function saveMediaFile(
  buffer: Buffer,
  relativePath: string,
  allowedRoot?: string
) {
  const root = allowedRoot ?? getMediaImportRoot();
  const full = path.join(root, relativePath);
  const safe = resolveSafePath(full, root);
  fs.mkdirSync(path.dirname(safe), { recursive: true });
  fs.writeFileSync(safe, buffer);
  return { absolutePath: safe, streamUrl: fileUrlForPath(safe), containerExtension: path.extname(safe).replace(".", "") || "mp4" };
}

export function resolveSourceToStreamUrl(
  source: string,
  allowedRoot?: string
): { streamUrl: string; absolutePath?: string } {
  const s = source.trim();
  if (/^(https?:\/\/|file:\/\/|rtmp|rtmps|srt|udp):/i.test(s)) {
    return { streamUrl: s };
  }
  const root = allowedRoot ?? getMediaImportRoot();
  const abs = s.startsWith("/") || /^[a-zA-Z]:\\/.test(s)
    ? resolveSafePath(s, root)
    : resolveSafePath(path.join(root, s), root);
  return { streamUrl: fileUrlForPath(abs), absolutePath: abs };
}

function walkVideos(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkVideos(full));
    else if (VIDEO_EXT.has(path.extname(ent.name).toLowerCase())) out.push(full);
  }
  return out;
}

export function parseSeriesFromPath(filePath: string, root: string) {
  const rel = path.relative(root, filePath);
  const parts = rel.split(path.sep);
  if (parts.length >= 3) {
    const seriesName = parts[0];
    const seasonMatch = parts[1].match(/season[\s._-]*(\d+)/i);
    const epMatch = path.basename(filePath).match(/[eE](\d+)|(\d+)x(\d+)/);
    return {
      seriesName,
      seasonNum: seasonMatch ? parseInt(seasonMatch[1], 10) : 1,
      episodeNum: epMatch ? parseInt(epMatch[1] ?? epMatch[3], 10) : 1,
      name: `${seriesName} S${seasonMatch?.[1] ?? "01"}E${epMatch?.[1] ?? epMatch?.[3] ?? "01"}`,
    };
  }
  return null;
}

type VodImportExtras = {
  streamIcon?: string | null;
  agentStartCmd?: string | null;
};

async function resolveVodCategoryAndMeta(opts: {
  type: StreamType;
  explicitCategoryId?: string | null;
  groupOrCategory?: string | null;
  seriesName?: string | null;
  filePath?: string;
  folderRoot?: string;
  displayName: string;
}): Promise<{ categoryId: string | null } & VodImportExtras> {
  let categoryId = opts.explicitCategoryId ?? null;
  let streamIcon: string | null = null;
  let agentStartCmd: string | null = null;

  const vodType = opts.type === "SERIES" ? "SERIES" : "MOVIE";
  let enrichment = null;

  if (vodType === "MOVIE" || vodType === "SERIES") {
    enrichment = await enrichVodFromTmdb(
      opts.displayName,
      vodType,
      opts.seriesName
    );
    if (enrichment) {
      streamIcon = enrichment.streamIcon;
      agentStartCmd = enrichment.agentStartCmd;
    }
  }

  if (!categoryId) {
    if (opts.groupOrCategory?.trim()) {
      categoryId = await categoryFromGroupName(opts.groupOrCategory, opts.type);
    } else if (opts.filePath && opts.folderRoot) {
      categoryId = await categoryFromFolderPath(
        opts.filePath,
        opts.folderRoot,
        opts.type,
        opts.seriesName
      );
    } else if (opts.type === "SERIES") {
      const genre = enrichment?.genreNames[0];
      categoryId = await categoryForSeries(opts.seriesName, genre);
    } else if (opts.type === "MOVIE") {
      categoryId = await categoryForMovie(enrichment?.genreNames[0]);
    }
  } else if (enrichment?.genreNames[0] && vodType === "MOVIE") {
    // Explicit category on watch folder still gets TMDB poster/metadata
  }

  return { categoryId, streamIcon, agentStartCmd };
}

export async function importM3uEntries(
  entries: M3uEntry[],
  opts: {
    defaultType?: "LIVE" | "MOVIE" | "SERIES";
    categoryId?: string | null;
    serverId?: string | null;
  }
) {
  clearTmdbImportCache();
  let imported = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!entry.url) {
      skipped++;
      continue;
    }
    const type = guessStreamType(entry, opts.defaultType) as StreamType;
    const existing = await prisma.stream.findFirst({
      where: { streamUrl: entry.url, type },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const meta =
      type === "MOVIE" || type === "SERIES"
        ? await resolveVodCategoryAndMeta({
            type,
            explicitCategoryId: opts.categoryId,
            groupOrCategory: entry.group,
            seriesName: type === "SERIES" ? entry.name : null,
            displayName: entry.name,
          })
        : {
            categoryId:
              opts.categoryId ??
              (entry.group
                ? (await categoryFromGroupName(entry.group, type))
                : null),
            streamIcon: entry.logo ?? null,
            agentStartCmd: null,
          };

    await prisma.stream.create({
      data: {
        name: entry.name,
        streamUrl: entry.url,
        streamIcon: meta.streamIcon ?? entry.logo ?? null,
        type,
        categoryId: meta.categoryId,
        serverId: opts.serverId ?? null,
        epgChannelId: entry.tvgId ?? null,
        seriesName: type === "SERIES" ? entry.name : null,
        agentStartCmd: meta.agentStartCmd,
        isOnDemand: type !== "LIVE",
        vodMode: type === "LIVE" ? VodMode.LIVE : VodMode.ON_DEMAND,
      },
    });
    imported++;
  }

  return { imported, skipped };
}

export async function importFromM3uContent(
  content: string,
  opts: Parameters<typeof importM3uEntries>[1]
) {
  const entries = parseM3u(content);
  return importM3uEntries(entries, opts);
}

export async function importFromFolder(
  folderPath: string,
  opts: {
    mode: "MOVIE" | "SERIES" | "MIXED";
    categoryId?: string | null;
    serverId?: string | null;
    allowedRoot?: string;
  }
) {
  clearTmdbImportCache();
  const safe = resolveSafePath(folderPath, opts.allowedRoot ?? process.env.MEDIA_IMPORT_ROOT);
  let imported = 0;
  let skipped = 0;

  const m3uFiles = walkVideos(safe).filter((f) => f.endsWith(".m3u") || f.endsWith(".m3u8"));
  for (const m3uFile of m3uFiles) {
    const content = fs.readFileSync(m3uFile, "utf8");
    const r = await importFromM3uContent(content, {
      defaultType: opts.mode === "SERIES" ? "SERIES" : opts.mode === "MOVIE" ? "MOVIE" : undefined,
      categoryId: opts.categoryId,
      serverId: opts.serverId,
    });
    imported += r.imported;
    skipped += r.skipped;
  }

  const videos = walkVideos(safe).filter((f) => !f.endsWith(".m3u") && !f.endsWith(".m3u8"));

  for (const file of videos) {
    const url = fileUrlForPath(file);
    const series = parseSeriesFromPath(file, safe);
    const type =
      opts.mode === "SERIES"
        ? StreamType.SERIES
        : opts.mode === "MOVIE"
          ? StreamType.MOVIE
          : series
            ? StreamType.SERIES
            : StreamType.MOVIE;

    const name = series?.name ?? path.basename(file, path.extname(file));
    const exists = await prisma.stream.findFirst({ where: { streamUrl: url } });
    if (exists) {
      skipped++;
      continue;
    }

    const meta = await resolveVodCategoryAndMeta({
      type,
      explicitCategoryId: opts.categoryId,
      seriesName: series?.seriesName,
      filePath: file,
      folderRoot: safe,
      displayName: name,
    });

    await prisma.stream.create({
      data: {
        name,
        streamUrl: url,
        streamIcon: meta.streamIcon,
        type,
        categoryId: meta.categoryId,
        serverId: opts.serverId ?? null,
        seriesName: series?.seriesName,
        seasonNum: series?.seasonNum,
        episodeNum: series?.episodeNum,
        containerExtension: path.extname(file).replace(".", "") || "mp4",
        agentStartCmd: meta.agentStartCmd,
        isOnDemand: true,
        vodMode: VodMode.ON_DEMAND,
      },
    });
    imported++;
  }

  return { imported, skipped };
}

export async function importFromVodRows(
  rows: import("./vod-import-parser").VodImportRow[],
  opts: {
    defaultType: "MOVIE" | "SERIES";
    categoryId?: string | null;
    serverId?: string | null;
    allowedRoot?: string;
  }
) {
  clearTmdbImportCache();
  const root = opts.allowedRoot ?? getMediaImportRoot();
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      let streamUrl = "";
      let providerId: string | null = null;
      let providerPath: string | null = null;
      let hostedExternally = Boolean(row.hosted_externally);

      if (row.provider_id && row.provider_path) {
        const provider = await prisma.streamProvider.findUnique({ where: { id: row.provider_id } });
        if (!provider) {
          errors.push(`${row.name}: provider not found`);
          skipped++;
          continue;
        }
        streamUrl = resolveProviderUrl(provider, row.provider_path);
        providerId = provider.id;
        providerPath = row.provider_path;
        hostedExternally = true;
      } else {
        const resolved = resolveSourceToStreamUrl(row.source, root);
        streamUrl = resolved.streamUrl;
      }
      const type =
        opts.defaultType === "SERIES" || row.series_name
          ? StreamType.SERIES
          : StreamType.MOVIE;

      const existing = await prisma.stream.findFirst({ where: { streamUrl, type } });
      if (existing) {
        skipped++;
        continue;
      }

      const meta = await resolveVodCategoryAndMeta({
        type,
        explicitCategoryId: opts.categoryId,
        groupOrCategory: row.category,
        seriesName: row.series_name,
        displayName: row.name,
      });

      const ext =
        row.container_extension ??
        (streamUrl.startsWith("file://")
          ? path.extname(streamUrl.replace(/^file:\/\//, "")).replace(".", "")
          : "mp4");

      await prisma.stream.create({
        data: {
          name: row.name,
          streamUrl,
          streamIcon: meta.streamIcon ?? row.stream_icon ?? null,
          type,
          categoryId: meta.categoryId,
          serverId: opts.serverId ?? null,
          seriesName: type === StreamType.SERIES ? row.series_name ?? row.name : null,
          seasonNum: type === StreamType.SERIES ? row.season_num ?? 1 : null,
          episodeNum: type === StreamType.SERIES ? row.episode_num ?? 1 : null,
          containerExtension: ext || "mp4",
          providerId,
          providerPath,
          hostedExternally,
          agentStartCmd: meta.agentStartCmd,
          isOnDemand: true,
          vodMode: VodMode.ON_DEMAND,
        },
      });
      imported++;
    } catch (e) {
      errors.push(`${row.name}: ${e instanceof Error ? e.message : "failed"}`);
      skipped++;
    }
  }

  return { imported, skipped, errors };
}
