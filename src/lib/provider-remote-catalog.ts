import { cacheGetOrSet } from "@/lib/cache";
import { prisma } from "@/lib/prisma";
import { assertPublicHttpUrl } from "@/lib/ssrf";
import { resolveProviderXtreamCreds } from "@/lib/stream-provider-probe";
import type { ProviderChannelMatch } from "@/lib/provider-channel-search";
import { xtreamListingExtension } from "@/lib/xtream-safe";

export type RemoteKind = "LIVE" | "MOVIE" | "SERIES";

type SlimRemoteItem = { name: string; streamId: string; ext: string; icon: string };

export type ProviderArtworkIndex = {
  byId: Map<string, string>;
  byName: Map<string, string>;
  hostToProviderIds: Map<string, string[]>;
};

function actionForKind(kind: RemoteKind): string {
  if (kind === "MOVIE") return "get_vod_streams";
  if (kind === "SERIES") return "get_series";
  return "get_live_streams";
}

function playbackUrl(origin: string, user: string, pass: string, kind: RemoteKind, id: string, ext: string): string {
  const u = encodeURIComponent(user);
  const p = encodeURIComponent(pass);
  if (kind === "MOVIE") return `${origin}/movie/${u}/${p}/${id}.${ext || "mp4"}`;
  if (kind === "SERIES") return `${origin}/series/${u}/${p}/${id}.${ext || "mkv"}`;
  return `${origin}/live/${u}/${p}/${id}.ts`;
}

function remoteContentId(rec: Record<string, unknown>, kind: RemoteKind): string {
  if (kind === "SERIES") return String(rec.series_id ?? rec.stream_id ?? rec.streamId ?? "").trim();
  return String(rec.stream_id ?? rec.streamId ?? rec.series_id ?? "").trim();
}

function remoteIcon(rec: Record<string, unknown>): string {
  const raw = String(rec.stream_icon ?? rec.cover ?? rec.cover_big ?? rec.movie_image ?? "").trim();
  return /^https?:\/\//i.test(raw) ? raw : "";
}

/** Xtream movie/live/series id from a provider playback URL. */
export function xtreamRemoteContentId(url: string): string | null {
  const s = url.trim();
  if (!/^https?:\/\//i.test(s)) return null;
  const path = s.match(/\/(?:live|movie|series)\/[^/?#]+\/[^/?#]+\/(\d+)(?:\.[a-z0-9]+)?(?:[?#]|$)/i);
  if (path?.[1]) return path[1];
  return null;
}

export function artworkNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function loadRemoteSlimCatalog(
  providerId: string,
  origin: string,
  username: string,
  password: string,
  kind: RemoteKind
): Promise<SlimRemoteItem[]> {
  return cacheGetOrSet(`provider-xtream:${providerId}:${kind}:v2`, 600, async () => {
    await assertPublicHttpUrl(origin);
    const url = `${origin}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=${actionForKind(kind)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
      headers: { "User-Agent": "Nexlify-Provider-Search/1.0" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];
    const out: SlimRemoteItem[] = [];
    const defaultExt = kind === "MOVIE" ? "mp4" : kind === "SERIES" ? "mkv" : "ts";
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
  });
}

export async function loadProviderArtworkIndex(kind: RemoteKind): Promise<ProviderArtworkIndex> {
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  const hostToProviderIds = new Map<string, string[]>();

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

  for (const provider of providers) {
    const creds = resolveProviderXtreamCreds(provider);
    if (!creds.origin || !creds.username || !creds.password) continue;
    let host = "";
    try {
      host = new URL(creds.origin).hostname.toLowerCase();
    } catch {
      continue;
    }
    const list = hostToProviderIds.get(host) ?? [];
    list.push(provider.id);
    hostToProviderIds.set(host, list);

    let items: SlimRemoteItem[] = [];
    try {
      items = await loadRemoteSlimCatalog(provider.id, creds.origin, creds.username, creds.password, kind);
    } catch {
      continue;
    }
    for (const item of items) {
      if (!item.icon) continue;
      byId.set(`${provider.id}:${item.streamId}`, item.icon);
      const nameKey = artworkNameKey(item.name);
      if (nameKey && !byName.has(`${provider.id}:${nameKey}`)) {
        byName.set(`${provider.id}:${nameKey}`, item.icon);
      }
    }
  }

  return { byId, byName, hostToProviderIds };
}

export function pickProviderArtwork(
  index: ProviderArtworkIndex,
  stream: {
    name: string;
    seriesName?: string | null;
    providerId?: string | null;
    providerPath?: string | null;
    streamUrl?: string | null;
  }
): string | null {
  const url = String(stream.streamUrl ?? "").trim();
  if (url.startsWith("nexlify://") || url.startsWith("file://")) return null;

  let host = "";
  try {
    if (/^https?:\/\//i.test(url)) host = new URL(url).hostname.toLowerCase();
  } catch {
    host = "";
  }

  const pids: string[] = [];
  if (stream.providerId) pids.push(stream.providerId);
  const hostPids = host ? index.hostToProviderIds.get(host) ?? [] : [];
  for (const id of hostPids) {
    if (!pids.includes(id)) pids.push(id);
  }
  if (!pids.length) return null;

  const pathId = String(stream.providerPath ?? "").trim();
  const contentId = /^\d+$/.test(pathId) ? pathId : xtreamRemoteContentId(url);
  const nameKey = artworkNameKey(stream.seriesName?.trim() || stream.name);

  for (const pid of pids) {
    if (contentId) {
      const byId = index.byId.get(`${pid}:${contentId}`);
      if (byId) return byId;
    }
    if (nameKey) {
      const byName = index.byName.get(`${pid}:${nameKey}`);
      if (byName) return byName;
    }
  }
  return null;
}

export async function searchRemoteProviderChannels(
  query: string,
  opts: { providerId: string; streamType?: "LIVE" | "MOVIE" | "SERIES"; limit?: number }
): Promise<ProviderChannelMatch[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2 || !opts.providerId) return [];

  const provider = await prisma.streamProvider.findUnique({
    where: { id: opts.providerId },
    select: {
      id: true,
      name: true,
      providerType: true,
      isActive: true,
      baseUrl: true,
      apiKey: true,
      remoteUsername: true,
      remotePassword: true,
    },
  });
  if (!provider?.isActive) return [];

  const creds = resolveProviderXtreamCreds(provider);
  if (!creds.origin || !creds.username || !creds.password) return [];

  const kind: RemoteKind =
    opts.streamType === "MOVIE" ? "MOVIE" : opts.streamType === "SERIES" ? "SERIES" : "LIVE";
  let items: SlimRemoteItem[];
  try {
    items = await loadRemoteSlimCatalog(provider.id, creds.origin, creds.username, creds.password, kind);
  } catch {
    return [];
  }

  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 80);
  const matches = items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, limit);
  return matches.map((i) => ({
    streamId: `remote:${provider.id}:${i.streamId}`,
    streamName: i.name,
    streamType: kind,
    providerId: provider.id,
    providerName: provider.name,
    providerType: provider.providerType,
    providerPath: i.streamId,
    streamUrl: playbackUrl(creds.origin!, creds.username!, creds.password!, kind, i.streamId, i.ext),
    source: "provider" as const,
  }));
}
