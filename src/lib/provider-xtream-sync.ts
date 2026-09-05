import { prisma } from "@/lib/prisma";
import { Prisma, StreamType } from "@prisma/client";
import { resolveProviderXtreamCreds } from "@/lib/stream-provider-probe";
import type { RemoteKind } from "@/lib/provider-remote-catalog";
import { xtreamListingExtension, xtreamUnixFromXtreamAdded } from "@/lib/xtream-safe";
import { assertPublicHttpUrl } from "@/lib/ssrf";
import { resolvePlaybackLoadBalancerId, pickVodLoadBalancerId } from "@/lib/server-load";
import { invalidateXtreamCategories, invalidateXtreamVodAndSeriesCatalogs } from "@/lib/cache-invalidate";
import { ensureIptvVodBouquetMembership } from "@/lib/integration-bouquet";
import { categoryForPlexMovie, categoryForPlexSeries } from "@/lib/vod-category";
import {
  buildLiveUrlShareCounts,
  shouldPreserveCoalescedLiveUrl,
} from "@/lib/live-coalesce-protect";

function providerPlaybackUrl(
  origin: string,
  user: string,
  pass: string,
  kind: RemoteKind,
  id: string,
  ext: string
): string {
  const u = encodeURIComponent(user);
  const p = encodeURIComponent(pass);
  if (kind === "MOVIE") return `${origin}/movie/${u}/${p}/${id}.${ext || "mp4"}`;
  if (kind === "SERIES") return `${origin}/series/${u}/${p}/${id}.${ext || "mkv"}`;
  return `${origin}/live/${u}/${p}/${id}.ts`;
}

type SlimRemoteItem = {
  name: string;
  streamId: string;
  ext: string;
  icon: string;
  /** Provider Xtream `added` (unix seconds) — drives XCIPTV Latest Movies. */
  addedUnix: number;
  /** Provider category name (from get_vod_categories / category_id). */
  categoryName: string;
};

type ExistingStreamHit = {
  id: string;
  name: string;
  streamIcon: string | null;
  streamUrl: string;
  createdAt: Date;
  categoryId: string | null;
};

type ManagedProvider = {
  baseUrl: string;
  apiKey?: string | null;
  providerType?: string | null;
};

/** 1-Stream reseller API adapter. Store the key/token as apiKey:apiToken. */
export async function oneStreamRequest(
  provider: ManagedProvider,
  endpoint: "create" | "status" | "renew" | "delete",
  body: Record<string, unknown>
): Promise<unknown> {
  await assertPublicHttpUrl(provider.baseUrl);
  const [apiKey, apiToken] = (provider.apiKey ?? "").split(/:([\s\S]*)/, 2);
  const res = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/api/lines/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}:${apiToken ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`1-Stream API HTTP ${res.status}`);
  return res.json();
}

/** NXT Dash API-key adapter. */
export async function nxtRequest(
  provider: ManagedProvider,
  endpoint: "lines" | "create" | "status" | "renew" | "delete" | "packages",
  body?: Record<string, unknown>,
  id?: string
): Promise<unknown> {
  await assertPublicHttpUrl(provider.baseUrl);
  const suffix =
    endpoint === "status" || endpoint === "renew" || endpoint === "delete"
      ? `/api/lines/${endpoint}/${encodeURIComponent(id ?? "")}` :
    endpoint === "create" ? "/api/lines/create" : `/api/${endpoint}`;
  const res = await fetch(`${provider.baseUrl.replace(/\/$/, "")}${suffix}`, {
    method: endpoint === "lines" || endpoint === "packages" ? "GET" : "POST",
    headers: {
      "X-API-Key": provider.apiKey ?? "",
      Authorization: `Token ${provider.apiKey ?? ""}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`NXT API HTTP ${res.status}`);
  return res.json();
}

export async function providerManagementRequest(
  provider: ManagedProvider,
  operation: "create" | "status" | "renew" | "delete" | "lines" | "packages",
  body?: Record<string, unknown>,
  id?: string,
): Promise<unknown> {
  if (provider.providerType === "onestream") {
    if (operation === "lines" || operation === "packages") {
      throw new Error("1-Stream does not expose this management endpoint");
    }
    return oneStreamRequest(provider, operation, body ?? {});
  }
  if (provider.providerType === "nxt") {
    return nxtRequest(provider, operation, body, id);
  }
  throw new Error(`Unsupported managed provider type: ${provider.providerType ?? "xtream"}`);
}

function actionForKind(kind: RemoteKind): string {
  if (kind === "MOVIE") return "get_vod_streams";
  if (kind === "SERIES") return "get_series";
  return "get_live_streams";
}

function remoteContentId(rec: Record<string, unknown>, kind: RemoteKind): string {
  if (kind === "SERIES") return String(rec.series_id ?? rec.stream_id ?? rec.streamId ?? "").trim();
  return String(rec.stream_id ?? rec.streamId ?? rec.series_id ?? "").trim();
}

function remoteIcon(rec: Record<string, unknown>): string {
  const raw = String(rec.stream_icon ?? rec.cover ?? rec.cover_big ?? rec.movie_image ?? "").trim();
  return /^https?:\/\//i.test(raw) ? raw : "";
}

async function fetchProviderCategoryNames(
  origin: string,
  username: string,
  password: string,
  kind: RemoteKind
): Promise<Map<string, string>> {
  const action =
    kind === "MOVIE" ? "get_vod_categories" : kind === "SERIES" ? "get_series_categories" : "get_live_categories";
  const byId = new Map<string, string>();
  try {
    await assertPublicHttpUrl(origin);
    const url = `${origin}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=${action}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
      headers: { "User-Agent": "Nexlify-Provider-Sync/1.0" },
    });
    if (!res.ok) return byId;
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return byId;
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const id = String(rec.category_id ?? rec.categoryId ?? "").trim();
      const name = String(rec.category_name ?? rec.name ?? "").trim();
      if (id && name) byId.set(id, name);
    }
  } catch {
    /* categories optional */
  }
  return byId;
}

async function fetchProviderCatalog(
  origin: string,
  username: string,
  password: string,
  kind: RemoteKind
): Promise<SlimRemoteItem[]> {
  await assertPublicHttpUrl(origin);
  const cats = await fetchProviderCategoryNames(origin, username, password, kind);
  const url = `${origin}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=${actionForKind(kind)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(90_000),
    headers: { "User-Agent": "Nexlify-Provider-Sync/1.0" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  const defaultExt = kind === "MOVIE" ? "mp4" : kind === "SERIES" ? "mkv" : "ts";
  const out: SlimRemoteItem[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const name = String(rec.name ?? rec.title ?? "").trim();
    const streamId = remoteContentId(rec, kind);
    if (!name || !streamId) continue;
    const ext = xtreamListingExtension(
      String(rec.container_extension ?? rec.containerExtension ?? ""),
      defaultExt
    );
    const catId = String(rec.category_id ?? rec.categoryId ?? "").trim();
    out.push({
      name,
      streamId,
      ext,
      icon: remoteIcon(rec),
      addedUnix: xtreamUnixFromXtreamAdded(rec.added ?? rec.added_at ?? rec.last_modified),
      categoryName: cats.get(catId) || "",
    });
  }
  return out;
}

const PROVIDER_SYNC_LOOKUP_CHUNK = 500;
const PROVIDER_SYNC_WRITE_CONCURRENCY = 8;

/** Match existing panel rows by exact playback URL. */
async function mapExistingStreamsByUrl(
  streamUrls: string[],
  streamType: StreamType
): Promise<Map<string, ExistingStreamHit>> {
  const byUrl = new Map<string, ExistingStreamHit>();
  for (let i = 0; i < streamUrls.length; i += PROVIDER_SYNC_LOOKUP_CHUNK) {
    const chunk = streamUrls.slice(i, i + PROVIDER_SYNC_LOOKUP_CHUNK);
    const rows = await prisma.stream.findMany({
      where: { streamUrl: { in: chunk }, type: streamType },
      select: { id: true, name: true, streamIcon: true, streamUrl: true, createdAt: true, categoryId: true },
    });
    for (const row of rows) byUrl.set(row.streamUrl, row);
  }
  return byUrl;
}

/**
 * Match by Xtream path id (`/movie/u/p/12345.mp4`) so re-imports with a different
 * host/creds still bump `createdAt` from the provider's `added` instead of duplicating.
 */
async function mapExistingStreamsByRemoteId(
  remoteIds: string[],
  streamType: StreamType,
  kind: RemoteKind
): Promise<Map<string, ExistingStreamHit>> {
  const byRemote = new Map<string, ExistingStreamHit>();
  if (!remoteIds.length || kind === "LIVE") return byRemote;
  const prefix = kind === "SERIES" ? "series" : "movie";
  const unique = [...new Set(remoteIds.map((id) => String(id).trim()).filter(Boolean))];
  for (let i = 0; i < unique.length; i += PROVIDER_SYNC_LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + PROVIDER_SYNC_LOOKUP_CHUNK);
    const pathRe = `/${prefix}/[^/]+/[^/]+/([0-9]+)`;
    const rows = await prisma.$queryRaw<Array<ExistingStreamHit & { remoteId: string | null }>>`
      SELECT
        s.id,
        s.name,
        s."streamIcon" AS "streamIcon",
        s."streamUrl" AS "streamUrl",
        s."createdAt" AS "createdAt",
        s."categoryId" AS "categoryId",
        (regexp_match(s."streamUrl", ${pathRe}))[1] AS "remoteId"
      FROM "Stream" s
      WHERE s.type = CAST(${streamType} AS "StreamType")
        AND (regexp_match(s."streamUrl", ${pathRe}))[1] IN (${Prisma.join(chunk)})
    `;
    for (const row of rows) {
      if (!row.remoteId || byRemote.has(row.remoteId)) continue;
      byRemote.set(row.remoteId, {
        id: row.id,
        name: row.name,
        streamIcon: row.streamIcon,
        streamUrl: row.streamUrl,
        createdAt: row.createdAt,
        categoryId: row.categoryId ?? null,
      });
    }
  }
  return byRemote;
}

function providerAddedDate(addedUnix: number): Date | null {
  if (!addedUnix || addedUnix <= 0) return null;
  const ms = addedUnix * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  // Reject absurd future stamps (> 2y ahead) that some panels emit as junk.
  if (ms > Date.now() + 730 * 86_400_000) return null;
  return new Date(ms);
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  if (!items.length) return;
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++]!;
      await fn(current);
    }
  });
  await Promise.all(workers);
}

export type ProviderXtreamSyncResult = {
  providerId: string;
  kind: RemoteKind;
  imported: number;
  updated: number;
  skipped: number;
};

/** Default catalog kind when no M3U sync job is attached. */
export function defaultProviderSyncKind(providerType: string | null | undefined): RemoteKind {
  const t = String(providerType || "").toLowerCase();
  if (t === "xtream_vod" || t === "vod" || t === "movies") return "MOVIE";
  return "LIVE";
}

/** Pull streams directly from a provider's player_api.php (XUI-style Xtream sync). */
export async function syncProviderXtreamCatalog(
  providerId: string,
  kind: RemoteKind = "LIVE",
  opts: { categoryId?: string | null; serverId?: string | null; updateNames?: boolean } = {}
): Promise<ProviderXtreamSyncResult> {
  const provider = await prisma.streamProvider.findUnique({ where: { id: providerId } });
  if (!provider?.isActive) {
    return { providerId, kind, imported: 0, updated: 0, skipped: 0 };
  }
  const creds = resolveProviderXtreamCreds(provider);
  if (!creds.origin || !creds.username || !creds.password) {
    return { providerId, kind, imported: 0, updated: 0, skipped: 0 };
  }

  const items = await fetchProviderCatalog(creds.origin, creds.username, creds.password, kind);
  const serverId =
    opts.serverId ??
    (kind === "LIVE" ? await resolvePlaybackLoadBalancerId(null) : await pickVodLoadBalancerId());
  const streamType =
    kind === "MOVIE" ? StreamType.MOVIE : kind === "SERIES" ? StreamType.SERIES : StreamType.LIVE;
  const updateNames = opts.updateNames !== false;

  const prepared = items.map((item) => ({
    item,
    streamUrl: providerPlaybackUrl(
      creds.origin!,
      creds.username!,
      creds.password!,
      kind,
      item.streamId,
      item.ext
    ),
  }));
  const existingByUrl = await mapExistingStreamsByUrl(
    prepared.map((row) => row.streamUrl),
    streamType
  );
  const unmatchedRemoteIds = prepared
    .filter((row) => !existingByUrl.has(row.streamUrl))
    .map((row) => row.item.streamId);
  const existingByRemoteId = await mapExistingStreamsByRemoteId(unmatchedRemoteIds, streamType, kind);

  let liveUrlShare = new Map<string, number>();
  if (streamType === StreamType.LIVE) {
    const liveUrls = await prisma.stream.findMany({
      where: { type: StreamType.LIVE, isActive: true, isRadio: false },
      select: { streamUrl: true },
    });
    liveUrlShare = buildLiveUrlShareCounts(liveUrls);
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  await runWithConcurrency(prepared, PROVIDER_SYNC_WRITE_CONCURRENCY, async ({ item, streamUrl }) => {
    const existing = existingByUrl.get(streamUrl) || existingByRemoteId.get(item.streamId);
    const providerAdded = providerAddedDate(item.addedUnix);
    let resolvedCategoryId = opts.categoryId ?? null;
    if (!resolvedCategoryId && (streamType === StreamType.MOVIE || streamType === StreamType.SERIES)) {
      resolvedCategoryId =
        streamType === StreamType.SERIES
          ? await categoryForPlexSeries(item.categoryName || "Recently Added")
          : await categoryForPlexMovie(item.categoryName || "Recently Added");
    }

    if (existing) {
      const createdUnix = Math.floor(existing.createdAt.getTime() / 1000);
      const recentProviderAdded =
        Boolean(providerAdded) &&
        item.addedUnix > 0 &&
        item.addedUnix > createdUnix &&
        item.addedUnix * 1000 >= Date.now() - 14 * 86_400_000;
      const shouldBumpAdded = recentProviderAdded;
      const shouldRename =
        updateNames && (existing.name !== item.name || (item.icon && !existing.streamIcon));
      const urlDiffers = existing.streamUrl !== streamUrl;
      const preserveCoalesce =
        streamType === StreamType.LIVE &&
        urlDiffers &&
        shouldPreserveCoalescedLiveUrl(existing.streamUrl, streamUrl, liveUrlShare);
      const shouldRetargetUrl = urlDiffers && !preserveCoalesce;
      const shouldSetCategory = Boolean(resolvedCategoryId) && !existing.categoryId;

      if (shouldBumpAdded || shouldRename || shouldRetargetUrl || shouldSetCategory) {
        await prisma.stream.update({
          where: { id: existing.id },
          data: {
            ...(shouldRename
              ? {
                  name: item.name,
                  ...(item.icon ? { streamIcon: item.icon } : {}),
                }
              : {}),
            ...(shouldRetargetUrl ? { streamUrl } : {}),
            ...(shouldBumpAdded && providerAdded ? { createdAt: providerAdded } : {}),
            ...(shouldSetCategory ? { categoryId: resolvedCategoryId } : {}),
            providerId: provider.id,
          },
        });
        if (streamType === StreamType.MOVIE || streamType === StreamType.SERIES) {
          await ensureIptvVodBouquetMembership(existing.id, streamType, 0);
        }
        updated++;
      } else {
        skipped++;
      }
      return;
    }

    const created = await prisma.stream.create({
      data: {
        name: item.name,
        streamUrl,
        streamIcon: item.icon || null,
        type: streamType,
        categoryId: resolvedCategoryId,
        serverId,
        providerId: provider.id,
        hostedExternally: true,
        isOnDemand: streamType === StreamType.LIVE,
        containerExtension: item.ext || (streamType === StreamType.LIVE ? "ts" : "mp4"),
        // XCIPTV Latest Movies uses createdAt as `added`. New-to-panel titles must
        // stamp "now" — provider `added` is often months old and would hide them.
      },
    });
    if (streamType === StreamType.MOVIE || streamType === StreamType.SERIES) {
      await ensureIptvVodBouquetMembership(created.id, streamType, 0);
    }
    imported++;
  });

  if (imported || updated) {
    await invalidateXtreamCategories();
    await invalidateXtreamVodAndSeriesCatalogs();
  }

  return { providerId, kind, imported, updated, skipped };
}

/** Cron: sync providers with Xtream creds (xtream_vod → MOVIE by default). */
export async function runDueProviderXtreamSync(limit = 2): Promise<{
  processed: number;
  imported: number;
  updated: number;
  errors: string[];
}> {
  const providers = await prisma.streamProvider.findMany({
    where: {
      isActive: true,
      OR: [
        { providerType: { in: ["live_upstream", "xtream_vod"] } },
        { m3uSyncJobs: { some: { status: "active" } } },
      ],
    },
    select: {
      id: true,
      name: true,
      baseUrl: true,
      apiKey: true,
      remoteUsername: true,
      remotePassword: true,
      providerType: true,
      m3uSyncJobs: {
        where: { status: "active" },
        select: { streamType: true, categoryId: true, serverId: true },
        take: 3,
      },
    },
    take: limit,
    orderBy: { updatedAt: "asc" },
  });

  let processed = 0;
  let imported = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const p of providers) {
    const creds = resolveProviderXtreamCreds(p);
    if (!creds.origin || !creds.username || !creds.password) continue;

    const jobs = p.m3uSyncJobs.length
      ? p.m3uSyncJobs
      : [{ streamType: defaultProviderSyncKind(p.providerType), categoryId: null, serverId: null }];

    try {
      for (const job of jobs) {
        const kind: RemoteKind =
          job.streamType === "MOVIE"
            ? "MOVIE"
            : job.streamType === "SERIES"
              ? "SERIES"
              : job.streamType === "LIVE"
                ? "LIVE"
                : defaultProviderSyncKind(p.providerType);
        const result = await syncProviderXtreamCatalog(p.id, kind, {
          categoryId: job.categoryId,
          serverId: job.serverId,
        });
        imported += result.imported;
        updated += result.updated;
      }
      processed++;
      await prisma.streamProvider.update({
        where: { id: p.id },
        data: { updatedAt: new Date() },
      });
    } catch (e) {
      errors.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { processed, imported, updated, errors };
}
