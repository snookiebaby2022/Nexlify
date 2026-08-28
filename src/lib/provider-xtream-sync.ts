import { prisma } from "@/lib/prisma";
import { StreamType } from "@prisma/client";
import { resolveProviderXtreamCreds } from "@/lib/stream-provider-probe";
import type { RemoteKind } from "@/lib/provider-remote-catalog";
import { xtreamListingExtension } from "@/lib/xtream-safe";
import { assertPublicHttpUrl } from "@/lib/ssrf";
import { resolvePlaybackLoadBalancerId, pickVodLoadBalancerId } from "@/lib/server-load";
import { invalidateXtreamCategories } from "@/lib/cache-invalidate";

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

type SlimRemoteItem = { name: string; streamId: string; ext: string; icon: string };

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

async function fetchProviderCatalog(
  origin: string,
  username: string,
  password: string,
  kind: RemoteKind
): Promise<SlimRemoteItem[]> {
  await assertPublicHttpUrl(origin);
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
    out.push({ name, streamId, ext, icon: remoteIcon(rec) });
  }
  return out;
}

export type ProviderXtreamSyncResult = {
  providerId: string;
  kind: RemoteKind;
  imported: number;
  updated: number;
  skipped: number;
};

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

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const streamUrl = providerPlaybackUrl(
      creds.origin,
      creds.username,
      creds.password,
      kind,
      item.streamId,
      item.ext
    );
    const existing = await prisma.stream.findFirst({
      where: { streamUrl, type: streamType },
      select: { id: true, name: true, streamIcon: true },
    });
    if (existing) {
      if (updateNames && (existing.name !== item.name || (item.icon && !existing.streamIcon))) {
        await prisma.stream.update({
          where: { id: existing.id },
          data: {
            name: item.name,
            ...(item.icon ? { streamIcon: item.icon } : {}),
            providerId: provider.id,
          },
        });
        updated++;
      } else {
        skipped++;
      }
      continue;
    }

    await prisma.stream.create({
      data: {
        name: item.name,
        streamUrl,
        streamIcon: item.icon || null,
        type: streamType,
        categoryId: opts.categoryId ?? null,
        serverId,
        providerId: provider.id,
        hostedExternally: true,
        isOnDemand: streamType === StreamType.LIVE,
        containerExtension: item.ext || (streamType === StreamType.LIVE ? "ts" : "mp4"),
      },
    });
    imported++;
  }

  if (imported || updated) {
    await invalidateXtreamCategories();
  }

  return { providerId, kind, imported, updated, skipped };
}

/** Cron: sync one provider per tick that has Xtream creds and an active M3U sync job or providerType live_upstream. */
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
        take: 1,
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
    const job = p.m3uSyncJobs[0];
    const kind: RemoteKind =
      job?.streamType === "MOVIE" ? "MOVIE" : job?.streamType === "SERIES" ? "SERIES" : "LIVE";
    try {
      const result = await syncProviderXtreamCatalog(p.id, kind, {
        categoryId: job?.categoryId,
        serverId: job?.serverId,
      });
      imported += result.imported;
      updated += result.updated;
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
