import { cacheGetOrSet } from "@/lib/cache";
import { prisma } from "@/lib/prisma";
import { assertPublicHttpUrl } from "@/lib/ssrf";
import { resolveProviderXtreamCreds } from "@/lib/stream-provider-probe";
import type { ProviderChannelMatch } from "@/lib/provider-channel-search";
import { xtreamListingExtension } from "@/lib/xtream-safe";

type RemoteKind = "LIVE" | "MOVIE";

type SlimRemoteItem = { name: string; streamId: string; ext: string };

function actionForKind(kind: RemoteKind): string {
  return kind === "MOVIE" ? "get_vod_streams" : "get_live_streams";
}

function playbackUrl(origin: string, user: string, pass: string, kind: RemoteKind, id: string, ext: string): string {
  const u = encodeURIComponent(user);
  const p = encodeURIComponent(pass);
  if (kind === "MOVIE") {
    return `${origin}/movie/${u}/${p}/${id}.${ext || "mp4"}`;
  }
  return `${origin}/live/${u}/${p}/${id}.ts`;
}

async function loadRemoteSlimCatalog(
  providerId: string,
  origin: string,
  username: string,
  password: string,
  kind: RemoteKind
): Promise<SlimRemoteItem[]> {
  return cacheGetOrSet(`provider-xtream:${providerId}:${kind}`, 600, async () => {
    await assertPublicHttpUrl(origin);
    const url = `${origin}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=${actionForKind(kind)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "Nexlify-Provider-Search/1.0" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];
    const out: SlimRemoteItem[] = [];
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const name = String(rec.name ?? rec.title ?? "").trim();
      const streamId = String(rec.stream_id ?? rec.streamId ?? "").trim();
      if (!name || !streamId) continue;
      const ext = xtreamListingExtension(
        String(rec.container_extension ?? rec.containerExtension ?? ""),
        kind === "MOVIE" ? "mp4" : "ts"
      );
      out.push({ name, streamId, ext });
    }
    return out;
  });
}

export async function searchRemoteProviderChannels(
  query: string,
  opts: { providerId: string; streamType?: "LIVE" | "MOVIE" | "SERIES"; limit?: number }
): Promise<ProviderChannelMatch[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2 || !opts.providerId) return [];
  if (opts.streamType === "SERIES") return [];

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

  const kind: RemoteKind = opts.streamType === "MOVIE" ? "MOVIE" : "LIVE";
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
