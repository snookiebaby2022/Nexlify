import { StreamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertPublicHttpUrl } from "@/lib/ssrf";
import { resolveProviderXtreamCreds } from "@/lib/stream-provider-probe";
import { categoryFromGroupName } from "@/lib/vod-category";
import { formatXuiCategoryName } from "@/lib/category-xui-name";
import { literalLiveNameKey } from "@/lib/stream-duplicates";
import { invalidateDashboardStats, invalidateXtreamCategories } from "@/lib/cache-invalidate";

export type RecategorizeFromProviderResult = {
  providers: number;
  remoteStreams: number;
  matched: number;
  updated: number;
  createdCategories: string[];
  unchanged: number;
  unmatched: number;
  samples: { name: string; from: string | null; to: string }[];
};

export function xtreamStreamIdFromUrl(url: string): string | null {
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  const withExt = raw.match(/\/(\d+)\.(?:ts|m3u8|mp4|mkv|avi)(?:\?|$)/i);
  if (withExt?.[1]) return withExt[1];
  const tail = raw.match(/\/(\d+)(?:\?|$)/);
  return tail?.[1] ?? null;
}

type RemoteLive = { streamId: string; name: string; categoryName: string };

async function fetchJson(url: string): Promise<unknown> {
  await assertPublicHttpUrl(url);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(90_000),
    headers: { "User-Agent": "Nexlify-Provider-Recategorize/1.0" },
  });
  if (!res.ok) return null;
  return res.json();
}

async function loadProviderLiveCatalog(
  origin: string,
  username: string,
  password: string
): Promise<RemoteLive[]> {
  const q = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const [catsRaw, streamsRaw] = await Promise.all([
    fetchJson(`${origin}/player_api.php?${q}&action=get_live_categories`),
    fetchJson(`${origin}/player_api.php?${q}&action=get_live_streams`),
  ]);
  const catName = new Map<string, string>();
  if (Array.isArray(catsRaw)) {
    for (const row of catsRaw) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const id = String(rec.category_id ?? "").trim();
      const name = String(rec.category_name ?? rec.name ?? "").trim();
      if (id && name) catName.set(id, name);
    }
  }
  const out: RemoteLive[] = [];
  if (!Array.isArray(streamsRaw)) return out;
  for (const row of streamsRaw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const streamId = String(rec.stream_id ?? rec.id ?? "").trim();
    const name = String(rec.name ?? rec.title ?? "").trim();
    const categoryId = String(rec.category_id ?? "").trim();
    const categoryName = catName.get(categoryId)?.trim() || "";
    if (!streamId || !name || !categoryName) continue;
    out.push({ streamId, name, categoryName });
  }
  return out;
}

export async function recategorizeLiveFromProviders(opts?: {
  dryRun?: boolean;
  sampleLimit?: number;
}): Promise<RecategorizeFromProviderResult> {
  const result: RecategorizeFromProviderResult = {
    providers: 0,
    remoteStreams: 0,
    matched: 0,
    updated: 0,
    createdCategories: [],
    unchanged: 0,
    unmatched: 0,
    samples: [],
  };

  const providers = await prisma.streamProvider.findMany({
    where: { isActive: true },
    select: {
      id: true,
      baseUrl: true,
      apiKey: true,
      remoteUsername: true,
      remotePassword: true,
    },
  });

  const byStreamId = new Map<string, RemoteLive>();
  const byName = new Map<string, RemoteLive[]>();

  for (const provider of providers) {
    const creds = resolveProviderXtreamCreds(provider);
    if (!creds.origin || !creds.username || !creds.password) continue;
    let remote: RemoteLive[] = [];
    try {
      remote = await loadProviderLiveCatalog(creds.origin, creds.username, creds.password);
    } catch {
      continue;
    }
    if (!remote.length) continue;
    result.providers += 1;
    result.remoteStreams += remote.length;
    for (const item of remote) {
      if (!byStreamId.has(item.streamId)) byStreamId.set(item.streamId, item);
      const nk = literalLiveNameKey(item.name);
      if (!nk) continue;
      const list = byName.get(nk) ?? [];
      list.push(item);
      byName.set(nk, list);
    }
  }

  if (!byStreamId.size) return result;

  const locals = await prisma.stream.findMany({
    where: { type: StreamType.LIVE, isRadio: false },
    select: {
      id: true,
      name: true,
      streamUrl: true,
      providerPath: true,
      categoryId: true,
      category: { select: { name: true } },
    },
  });

  const categoryCache = new Map<string, string>();
  const existingCats = await prisma.category.findMany({
    where: { categoryType: "LIVE" },
    select: { id: true, name: true },
  });
  for (const c of existingCats) {
    categoryCache.set(c.name, c.id);
    categoryCache.set(formatXuiCategoryName(c.name), c.id);
  }

  async function resolveCategoryId(rawName: string): Promise<string> {
    const formatted = formatXuiCategoryName(rawName);
    const hit = categoryCache.get(formatted) ?? categoryCache.get(rawName);
    if (hit) return hit;
    const id = await categoryFromGroupName(formatted, StreamType.LIVE);
    categoryCache.set(formatted, id);
    if (!result.createdCategories.includes(formatted) && !existingCats.some((c) => c.id === id || c.name === formatted)) {
      result.createdCategories.push(formatted);
    }
    return id;
  }

  const sampleLimit = opts?.sampleLimit ?? 24;

  for (const local of locals) {
    const fromUrl = xtreamStreamIdFromUrl(local.streamUrl);
    const fromPath = String(local.providerPath ?? "").replace(/^remote:[^:]+:/, "").trim();
    let remote =
      (fromUrl && byStreamId.get(fromUrl)) ||
      (fromPath && byStreamId.get(fromPath)) ||
      null;
    if (!remote) {
      const named = byName.get(literalLiveNameKey(local.name));
      if (named?.length === 1) remote = named[0]!;
    }
    if (!remote) {
      result.unmatched += 1;
      continue;
    }
    result.matched += 1;
    const nextName = formatXuiCategoryName(remote.categoryName);
    if (local.category?.name === nextName) {
      result.unchanged += 1;
      continue;
    }
    if (result.samples.length < sampleLimit) {
      result.samples.push({
        name: local.name,
        from: local.category?.name ?? null,
        to: nextName,
      });
    }
    if (opts?.dryRun) {
      result.updated += 1;
      continue;
    }
    const categoryId = await resolveCategoryId(nextName);
    if (local.categoryId === categoryId) {
      result.unchanged += 1;
      continue;
    }
    await prisma.stream.update({
      where: { id: local.id },
      data: { categoryId },
    });
    result.updated += 1;
  }

  if (!opts?.dryRun && result.updated > 0) {
    await invalidateXtreamCategories();
    await invalidateDashboardStats();
  }

  return result;
}
