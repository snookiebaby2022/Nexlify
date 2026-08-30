import { StreamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertPublicHttpUrl } from "@/lib/ssrf";
import { resolveProviderXtreamCreds } from "@/lib/stream-provider-probe";
import { categoryFromGroupName } from "@/lib/vod-category";
import { formatXuiCategoryName } from "@/lib/category-xui-name";
import { invalidateDashboardStats, invalidateXtreamCategories } from "@/lib/cache-invalidate";

export type RecategorizeFromProviderResult = {
  providers: number;
  remoteStreams: number;
  matched: number;
  updated: number;
  createdCategories: string[];
  unchanged: number;
  unmatched: number;
  skippedOtherProvider: number;
  skippedExisting: number;
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

export function urlHostKey(raw: string): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `http://${value}`);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

export function streamBelongsToProvider(
  local: { providerId: string | null; streamUrl: string },
  providerId: string,
  providerHost: string | null
): boolean {
  if (local.providerId) return local.providerId === providerId;
  if (!providerHost) return false;
  return urlHostKey(local.streamUrl) === providerHost;
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

export async function recategorizeLiveFromProviders(opts: {
  providerId: string;
  dryRun?: boolean;
  overwriteExisting?: boolean;
  sampleLimit?: number;
}): Promise<RecategorizeFromProviderResult> {
  const providerId = String(opts.providerId ?? "").trim();
  if (!providerId) {
    throw new Error("providerId is required — matching every provider at once is disabled");
  }

  const result: RecategorizeFromProviderResult = {
    providers: 0,
    remoteStreams: 0,
    matched: 0,
    updated: 0,
    createdCategories: [],
    unchanged: 0,
    unmatched: 0,
    skippedOtherProvider: 0,
    skippedExisting: 0,
    samples: [],
  };

  const provider = await prisma.streamProvider.findUnique({
    where: { id: providerId },
    select: {
      id: true,
      baseUrl: true,
      apiKey: true,
      remoteUsername: true,
      remotePassword: true,
    },
  });
  if (!provider) {
    throw new Error("Provider not found");
  }

  const creds = resolveProviderXtreamCreds(provider);
  if (!creds.origin || !creds.username || !creds.password) {
    throw new Error("Provider is missing Xtream credentials");
  }

  const providerHost = urlHostKey(creds.origin);
  let remote: RemoteLive[] = [];
  try {
    remote = await loadProviderLiveCatalog(creds.origin, creds.username, creds.password);
  } catch {
    return result;
  }
  if (!remote.length) return result;

  result.providers = 1;
  result.remoteStreams = remote.length;

  const byStreamId = new Map<string, RemoteLive>();
  for (const item of remote) {
    byStreamId.set(`${provider.id}:${item.streamId}`, item);
  }

  const hostFilter = providerHost
    ? [{ providerId: null as string | null, streamUrl: { contains: providerHost } }]
    : [];
  const locals = await prisma.stream.findMany({
    where: {
      type: StreamType.LIVE,
      isRadio: false,
      OR: [{ providerId: provider.id }, ...hostFilter],
    },
    select: {
      id: true,
      name: true,
      streamUrl: true,
      providerPath: true,
      providerId: true,
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

  const sampleLimit = opts.sampleLimit ?? 24;
  const overwriteExisting = opts.overwriteExisting === true;

  for (const local of locals) {
    if (!streamBelongsToProvider(local, provider.id, providerHost)) {
      result.skippedOtherProvider += 1;
      continue;
    }
    const fromUrl = xtreamStreamIdFromUrl(local.streamUrl);
    const fromPath = String(local.providerPath ?? "").replace(/^remote:[^:]+:/, "").trim();
    const remoteHit =
      (fromUrl && byStreamId.get(`${provider.id}:${fromUrl}`)) ||
      (fromPath && byStreamId.get(`${provider.id}:${fromPath}`)) ||
      null;
    if (!remoteHit) {
      result.unmatched += 1;
      continue;
    }
    result.matched += 1;
    const nextName = formatXuiCategoryName(remoteHit.categoryName);
    if (local.category?.name === nextName) {
      result.unchanged += 1;
      continue;
    }
    if (local.categoryId && !overwriteExisting) {
      result.skippedExisting += 1;
      continue;
    }
    if (result.samples.length < sampleLimit) {
      result.samples.push({
        name: local.name,
        from: local.category?.name ?? null,
        to: nextName,
      });
    }
    if (opts.dryRun) {
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

  if (!opts.dryRun && result.updated > 0) {
    await invalidateXtreamCategories();
    await invalidateDashboardStats();
  }

  return result;
}
