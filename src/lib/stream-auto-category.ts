import { StreamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { categoryIdFromStreamName, inferGroupFromStreamName } from "@/lib/stream-name-category";
import { categoryFromGroupName } from "@/lib/vod-category";
import { formatXuiCategoryName } from "@/lib/category-xui-name";
import {
  streamBelongsToProvider,
  urlHostKey,
  xtreamStreamIdFromUrl,
} from "@/lib/recategorize-from-provider";
import { resolveProviderXtreamCreds } from "@/lib/stream-provider-probe";

type StreamPick = {
  id: string;
  name: string;
  type: StreamType;
  streamUrl: string;
  providerId: string | null;
  providerPath: string | null;
  categoryId: string | null;
};

type RemoteLive = { streamId: string; categoryName: string };

async function loadProviderRemoteMap(providerId: string): Promise<Map<string, RemoteLive> | null> {
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
  if (!provider?.baseUrl) return null;
  const creds = resolveProviderXtreamCreds(provider);
  if (!creds.origin || !creds.username || !creds.password) return null;

  const origin = creds.origin.replace(/\/+$/, "");
  const q = `username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}`;
  const [catsRaw, streamsRaw] = await Promise.all([
    fetch(`${origin}/player_api.php?${q}&action=get_live_categories`, {
      signal: AbortSignal.timeout(60_000),
    }).then((r) => (r.ok ? r.json() : null)),
    fetch(`${origin}/player_api.php?${q}&action=get_live_streams`, {
      signal: AbortSignal.timeout(120_000),
    }).then((r) => (r.ok ? r.json() : null)),
  ]);

  const catName = new Map<string, string>();
  if (Array.isArray(catsRaw)) {
    for (const row of catsRaw) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const id = String(rec.category_id ?? "").trim();
      const name = String(rec.category_name ?? "").trim();
      if (id && name) catName.set(id, name);
    }
  }

  const map = new Map<string, RemoteLive>();
  if (Array.isArray(streamsRaw)) {
    for (const row of streamsRaw) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const streamId = String(rec.stream_id ?? rec.num ?? "").trim();
      const catId = String(rec.category_id ?? "").trim();
      const categoryName = catName.get(catId) ?? "";
      if (streamId && categoryName) {
        map.set(streamId, { streamId, categoryName });
      }
    }
  }
  return map.size ? map : null;
}

async function matchExistingCategoryByName(name: string, type: StreamType): Promise<string | null> {
  const categoryType = type === "MOVIE" ? "MOVIE" : type === "SERIES" ? "SERIES" : "LIVE";
  const cats = await prisma.category.findMany({
    where: { categoryType },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const lower = name.toLowerCase();
  let best: { id: string; len: number } | null = null;
  for (const c of cats) {
    const cn = c.name.trim();
    if (!cn) continue;
    const cl = cn.toLowerCase();
    if (lower.startsWith(cl) || lower.includes(` ${cl} `) || lower.includes(`| ${cl}`)) {
      if (!best || cn.length > best.len) best = { id: c.id, len: cn.length };
    }
  }
  return best?.id ?? null;
}

function remoteHitForStream(
  stream: StreamPick,
  providerId: string,
  remote: Map<string, RemoteLive>
): RemoteLive | null {
  const fromUrl = xtreamStreamIdFromUrl(stream.streamUrl);
  const fromPath = String(stream.providerPath ?? "").replace(/^remote:[^:]+:/, "").trim();
  if (fromUrl && remote.has(fromUrl)) return remote.get(fromUrl)!;
  if (fromPath && remote.has(fromPath)) return remote.get(fromPath)!;
  return null;
}

export async function resolveAutoCategoryId(
  stream: StreamPick,
  opts: { useProvider?: boolean; providerRemote?: Map<string, RemoteLive> | null; providerHost?: string | null }
): Promise<string | null> {
  if (stream.categoryId) return null;

  const fromName = await categoryIdFromStreamName(stream.name, stream.type);
  if (fromName) return fromName;

  const group = inferGroupFromStreamName(stream.name);
  if (!group) {
    const existing = await matchExistingCategoryByName(stream.name, stream.type);
    if (existing) return existing;
  }

  if (opts.useProvider !== false && stream.type === "LIVE" && stream.providerId) {
    const host = opts.providerHost ?? null;
    if (!streamBelongsToProvider(stream, stream.providerId, host)) {
      return null;
    }
    let remote = opts.providerRemote;
    if (remote === undefined) {
      remote = await loadProviderRemoteMap(stream.providerId);
    }
    if (remote) {
      const hit = remoteHitForStream(stream, stream.providerId, remote);
      if (hit?.categoryName) {
        return categoryFromGroupName(formatXuiCategoryName(hit.categoryName), StreamType.LIVE);
      }
    }
  }

  return null;
}

export async function autoAssignCategories(
  streams: StreamPick[],
  opts: { useProvider?: boolean } = {}
): Promise<{ updated: number; skipped: number }> {
  let updated = 0;
  let skipped = 0;
  const remoteByProvider = new Map<string, Map<string, RemoteLive>>();
  const hostByProvider = new Map<string, string | null>();

  for (const s of streams) {
    if (s.categoryId) {
      skipped += 1;
      continue;
    }
    let remote: Map<string, RemoteLive> | null | undefined;
    if (s.providerId && s.type === "LIVE") {
      if (!remoteByProvider.has(s.providerId)) {
        remoteByProvider.set(s.providerId, (await loadProviderRemoteMap(s.providerId)) ?? new Map());
        const p = await prisma.streamProvider.findUnique({
          where: { id: s.providerId },
          select: { baseUrl: true },
        });
        hostByProvider.set(s.providerId, p?.baseUrl ? urlHostKey(p.baseUrl) : null);
      }
      remote = remoteByProvider.get(s.providerId);
    }
    const categoryId = await resolveAutoCategoryId(s, {
      useProvider: opts.useProvider,
      providerRemote: remote,
      providerHost: s.providerId ? hostByProvider.get(s.providerId) : null,
    });
    if (!categoryId) {
      skipped += 1;
      continue;
    }
    await prisma.stream.update({ where: { id: s.id }, data: { categoryId } });
    updated += 1;
  }
  return { updated, skipped };
}
