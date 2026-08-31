import fs from "fs";
import path from "path";
import { StreamType } from "@prisma/client";
import { prisma } from "./prisma";
import { importFromM3uContent } from "./import-media";
import {
  fetchM3uContent,
  isRemoteM3uUrl,
  resolveM3uDefaultType,
  type M3uContentType,
} from "./m3u-watch-sync";
import { guessStreamType, parseM3u, type M3uEntry } from "./m3u-parser";
import { literalLiveNameKey, pickKeepId, type DuplicateScanRow } from "./stream-duplicates";
import { formatXuiCategoryName } from "./category-xui-name";
import { normalizeStreamMatchKey } from "./stream-url-match";
import { liveStreamDisplayName } from "./import-live-m3u";
import { fileUrlForPath, resolveSafePath } from "./import-media";

export type WatchFolderM3uOpts = {
  id?: string;
  name?: string;
  path: string;
  type: string;
  categoryId?: string | null;
  serverId?: string | null;
  autoCategory?: boolean;
  updateNames?: boolean;
  overwriteCategories?: boolean;
  onDemand?: boolean;
  removeDuplicates?: boolean;
  isAdult?: boolean;
};

export function isLocalM3uPath(source: string): boolean {
  const value = String(source ?? "").trim();
  if (!value || isRemoteM3uUrl(value)) return false;
  return /\.m3u8?$/i.test(value);
}

export function buildXtreamM3uUrl(
  origin: string,
  username: string,
  password: string,
  output = "ts"
): string {
  const base = origin.trim().replace(/\/+$/, "");
  if (!base) return "";
  const withProto = /^https?:\/\//i.test(base) ? base : `http://${base}`;
  const q = new URLSearchParams({
    username: username.trim(),
    password: password.trim(),
    type: "m3u_plus",
    output: output.trim() || "ts",
  });
  return `${withProto}/get.php?${q}`;
}

export function watchM3uUploadDir(): string {
  return path.join(process.cwd(), "data", "watch-m3u");
}

export function writeWatchM3uFile(folderId: string, content: string): string {
  const dir = watchM3uUploadDir();
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${folderId}.m3u`);
  fs.writeFileSync(dest, content, "utf8");
  return dest;
}

function readLocalM3uFile(filePath: string): string {
  const safe = path.resolve(filePath);
  const uploadRoot = path.resolve(watchM3uUploadDir());
  const mediaRoot = process.env.MEDIA_IMPORT_ROOT
    ? path.resolve(process.env.MEDIA_IMPORT_ROOT)
    : null;
  const allowed = safe.startsWith(uploadRoot) || !mediaRoot || safe.startsWith(mediaRoot);
  if (!allowed) {
    throw new Error(`Path must be under ${mediaRoot}`);
  }
  if (!fs.existsSync(safe) || !fs.statSync(safe).isFile()) {
    throw new Error(`M3U file not found: ${filePath}`);
  }
  const content = fs.readFileSync(safe, "utf8");
  if (!content.includes("#EXTM3U") && !content.includes("#EXTINF:")) {
    throw new Error("File does not look like an M3U playlist");
  }
  return content;
}

export type WatchReviewRow = {
  action: "add" | "rename" | "move" | "keep" | "dedupe";
  name: string;
  nextName?: string;
  type: string;
  fromFolder?: string | null;
  toFolder?: string | null;
};

export type WatchReview = {
  kind: "m3u" | "folder";
  entries: number;
  add: number;
  keep: number;
  rename: number;
  move: number;
  dedupe: number;
  samples: WatchReviewRow[];
  flags: {
    autoCategory: boolean;
    updateNames: boolean;
    overwriteCategories: boolean;
    onDemand: boolean;
    removeDuplicates: boolean;
  };
};

export type WatchReviewExisting = {
  streamUrl: string;
  name: string;
  categoryName: string | null;
};

const SAMPLE_CAP = 16;

export function planWatchFolderM3uReview(
  entries: M3uEntry[],
  existing: WatchReviewExisting[],
  opts: {
    type: string;
    updateNames?: boolean;
    overwriteCategories?: boolean;
    autoCategory?: boolean;
    removeDuplicates?: boolean;
    defaultCategoryName?: string | null;
  }
): WatchReview {
  const forced = resolveM3uDefaultType(opts.type);
  const updateNames = opts.updateNames !== false;
  const overwriteCategories = opts.overwriteCategories !== false;
  const autoCategory = opts.autoCategory !== false;
  const removeDuplicates = opts.removeDuplicates === true;

  const byExact = new Map<string, WatchReviewExisting>();
  const byNorm = new Map<string, WatchReviewExisting>();
  for (const row of existing) {
    byExact.set(row.streamUrl, row);
    const key = normalizeStreamMatchKey(row.streamUrl);
    if (key && !byNorm.has(key)) byNorm.set(key, row);
  }

  const seenUrl = new Set<string>();
  const unique: M3uEntry[] = [];
  for (const entry of entries) {
    if (!entry.url || seenUrl.has(entry.url)) continue;
    seenUrl.add(entry.url);
    unique.push(entry);
  }

  const buckets: Record<WatchReviewRow["action"], WatchReviewRow[]> = {
    add: [],
    rename: [],
    move: [],
    keep: [],
    dedupe: [],
  };
  let add = 0;
  let keep = 0;
  let rename = 0;
  let move = 0;
  const matchedExisting: WatchReviewExisting[] = [];

  const pushSample = (row: WatchReviewRow) => {
    const list = buckets[row.action];
    if (list.length < 4) list.push(row);
  };

  for (const entry of unique) {
    const type = guessStreamType(entry, forced);
    const nextName =
      type === "LIVE" ? liveStreamDisplayName(entry) : (entry.name || "Unknown").slice(0, 200);
    const toFolder = autoCategory
      ? formatXuiCategoryName(entry.group || "") || opts.defaultCategoryName || null
      : opts.defaultCategoryName || null;
    const hit =
      byExact.get(entry.url) ?? byNorm.get(normalizeStreamMatchKey(entry.url) ?? "") ?? null;

    if (!hit) {
      add += 1;
      pushSample({ action: "add", name: nextName, type, toFolder });
      continue;
    }
    matchedExisting.push(hit);
    const nameChanged = updateNames && nextName && nextName !== hit.name;
    const folderChanged =
      overwriteCategories && autoCategory && toFolder && toFolder !== (hit.categoryName || "");
    if (nameChanged) {
      rename += 1;
      pushSample({
        action: "rename",
        name: hit.name,
        nextName,
        type,
        fromFolder: hit.categoryName,
        toFolder: folderChanged ? toFolder : hit.categoryName,
      });
    }
    if (folderChanged) {
      move += 1;
      if (!nameChanged) {
        pushSample({
          action: "move",
          name: nextName,
          type,
          fromFolder: hit.categoryName,
          toFolder,
        });
      }
    }
    if (!nameChanged && !folderChanged) {
      keep += 1;
      pushSample({ action: "keep", name: nextName, type, toFolder: hit.categoryName });
    }
  }

  let dedupe = 0;
  if (removeDuplicates) {
    const groups = new Map<string, WatchReviewExisting[]>();
    for (const row of matchedExisting) {
      const base = literalLiveNameKey(row.name);
      if (!base) continue;
      const key = `${base}::${row.categoryName ?? ""}`;
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const extras = group.slice(1);
      dedupe += extras.length;
      for (const extra of extras) {
        pushSample({
          action: "dedupe",
          name: extra.name,
          type: "LIVE",
          fromFolder: extra.categoryName,
        });
      }
    }
  }

  const samples = [
    ...buckets.add,
    ...buckets.rename,
    ...buckets.move,
    ...buckets.keep,
    ...buckets.dedupe,
  ].slice(0, SAMPLE_CAP);

  return {
    kind: "m3u",
    entries: unique.length,
    add,
    keep,
    rename,
    move,
    dedupe,
    samples,
    flags: {
      autoCategory,
      updateNames,
      overwriteCategories,
      onDemand: true,
      removeDuplicates,
    },
  };
}

async function removeExactNameDupsForUrls(urls: string[]): Promise<number> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  if (!unique.length) return 0;
  const rows = await prisma.stream.findMany({
    where: { type: StreamType.LIVE, isRadio: false, isActive: true, streamUrl: { in: unique } },
    select: {
      id: true,
      name: true,
      streamUrl: true,
      type: true,
      seriesName: true,
      seasonNum: true,
      episodeNum: true,
      isActive: true,
      categoryId: true,
      createdAt: true,
      isOnDemand: true,
      streamIcon: true,
      category: { select: { name: true } },
      _count: { select: { bouquets: true } },
    },
  });
  const groups = new Map<string, DuplicateScanRow[]>();
  for (const r of rows) {
    const base = literalLiveNameKey(r.name);
    if (!base) continue;
    const key = `${base}::${r.categoryId ?? ""}`;
    const mapped: DuplicateScanRow = {
      id: r.id,
      name: r.name,
      streamUrl: r.streamUrl,
      type: r.type,
      seriesName: r.seriesName,
      seasonNum: r.seasonNum,
      episodeNum: r.episodeNum,
      isActive: r.isActive,
      categoryId: r.categoryId,
      categoryName: r.category?.name ?? null,
      bouquetCount: r._count.bouquets,
      createdAt: r.createdAt,
      isOnDemand: r.isOnDemand,
      hasIcon: Boolean(String(r.streamIcon ?? "").trim()),
    };
    const list = groups.get(key) ?? [];
    list.push(mapped);
    groups.set(key, list);
  }
  let deactivated = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keepId = pickKeepId(group);
    const extras = group.filter((g) => g.id !== keepId).map((g) => g.id);
    if (!extras.length) continue;
    await prisma.stream.updateMany({ where: { id: { in: extras } }, data: { isActive: false } });
    deactivated += extras.length;
  }
  return deactivated;
}

async function loadWatchM3uContent(source: string): Promise<string> {
  if (isRemoteM3uUrl(source)) return fetchM3uContent(source);
  if (isLocalM3uPath(source)) return readLocalM3uFile(source);
  throw new Error("Watch source is not an M3U URL or .m3u file");
}

export async function syncWatchFolderM3u(folder: WatchFolderM3uOpts) {
  const forced = resolveM3uDefaultType(folder.type);
  const defaultType: M3uContentType | undefined =
    folder.type === "MIXED" || folder.type === "M3U" ? undefined : forced;

  const content = await loadWatchM3uContent(folder.path);

  const result = await importFromM3uContent(content, {
    defaultType,
    categoryId: folder.categoryId,
    serverId: folder.serverId,
    autoCategory: folder.autoCategory !== false,
    autoTmdb: true,
    defaultOnDemand: folder.onDemand !== false ? true : false,
    updateNamesOnSync: folder.updateNames !== false,
    overwriteCategories: folder.overwriteCategories !== false,
    importMeta: folder.isAdult ? { isAdult: true } : undefined,
  });

  let deduped = 0;
  if (folder.removeDuplicates) {
    const urls = parseM3u(content).map((e) => e.url).filter(Boolean);
    deduped = await removeExactNameDupsForUrls(urls);
  }

  return { ...result, deduped };
}

export async function reviewWatchM3uContent(
  content: string,
  folder: WatchFolderM3uOpts
): Promise<WatchReview> {
  const entries = parseM3u(content);
  const urls = [...new Set(entries.map((e) => e.url).filter(Boolean))];
  const existing: WatchReviewExisting[] = [];
  for (let i = 0; i < urls.length; i += 400) {
    const slice = urls.slice(i, i + 400);
    const rows = await prisma.stream.findMany({
      where: { streamUrl: { in: slice } },
      select: { streamUrl: true, name: true, category: { select: { name: true } } },
    });
    for (const row of rows) {
      existing.push({
        streamUrl: row.streamUrl,
        name: row.name,
        categoryName: row.category?.name ?? null,
      });
    }
  }
  let defaultCategoryName: string | null = null;
  if (folder.categoryId) {
    const cat = await prisma.category.findUnique({
      where: { id: folder.categoryId },
      select: { name: true },
    });
    defaultCategoryName = cat?.name ?? null;
  }
  const review = planWatchFolderM3uReview(entries, existing, {
    type: folder.type,
    updateNames: folder.updateNames,
    overwriteCategories: folder.overwriteCategories,
    autoCategory: folder.autoCategory,
    removeDuplicates: folder.removeDuplicates,
    defaultCategoryName,
  });
  review.flags.onDemand = folder.onDemand !== false;
  return review;
}

export async function reviewWatchFolder(folder: WatchFolderM3uOpts): Promise<WatchReview> {
  if (isRemoteM3uUrl(folder.path) || isLocalM3uPath(folder.path)) {
    return reviewWatchM3uContent(await loadWatchM3uContent(folder.path), folder);
  }

  const safe = resolveSafePath(folder.path, process.env.MEDIA_IMPORT_ROOT);
  const files: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    const st = fs.statSync(dir);
    if (st.isFile()) {
      files.push(dir);
      return;
    }
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(safe);
  const media = files.filter((f) =>
    /\.(mp4|mkv|avi|mov|wmv|m4v|ts|m3u8|m3u)$/i.test(f)
  );
  const urls = media.map((f) => fileUrlForPath(f));
  const existing = urls.length
    ? await prisma.stream.findMany({
        where: { streamUrl: { in: urls } },
        select: { streamUrl: true },
      })
    : [];
  const have = new Set(existing.map((r) => r.streamUrl));
  const add = urls.filter((u) => !have.has(u)).length;
  const samples: WatchReviewRow[] = media.slice(0, SAMPLE_CAP).map((f) => ({
    action: have.has(fileUrlForPath(f)) ? "keep" : "add",
    name: path.basename(f),
    type: /\.m3u8?$/i.test(f) ? "M3U" : folder.type === "SERIES" ? "SERIES" : "MOVIE",
  }));
  return {
    kind: "folder",
    entries: media.length,
    add,
    keep: media.length - add,
    rename: 0,
    move: 0,
    dedupe: 0,
    samples,
    flags: {
      autoCategory: folder.autoCategory !== false,
      updateNames: folder.updateNames !== false,
      overwriteCategories: folder.overwriteCategories !== false,
      onDemand: folder.onDemand !== false,
      removeDuplicates: folder.removeDuplicates === true,
    },
  };
}
