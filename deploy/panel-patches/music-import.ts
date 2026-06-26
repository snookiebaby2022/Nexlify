import { prisma } from "@/lib/prisma";
import { StreamType } from "@prisma/client";
import { buildIntegrationStreamUrl } from "@/lib/integration-stream-url";
import { linkStreamToPluginBouquet } from "@/lib/integration-bouquet";
import {
  fetchAppleMusicCatalogPlaylist,
  fetchDeezerRelayPlaylist,
  fetchSpotifyRelayPlaylist,
  musicRelayBase,
  spotifyAccessToken,
} from "@/lib/music-relay";

async function upsertIntegrationStream(opts: {
  integrationId: string;
  type: string;
  itemId: string;
  name: string;
  streamType: StreamType;
  serverId?: string | null;
  streamIcon?: string | null;
}) {
  const streamUrl = buildIntegrationStreamUrl(opts.type, opts.integrationId, opts.itemId);
  const existing = await prisma.stream.findFirst({
    where: { streamUrl },
  });
  if (existing) {
    await prisma.stream.update({
      where: { id: existing.id },
      data: {
        name: opts.name,
        isActive: true,
        serverId: opts.serverId ?? undefined,
        streamIcon: opts.streamIcon ?? undefined,
        hostedExternally: true,
      },
    });
    await linkStreamToPluginBouquet(existing.id);
    return { created: false, id: existing.id };
  }
  const stream = await prisma.stream.create({
    data: {
      name: opts.name,
      streamUrl,
      type: opts.streamType,
      serverId: opts.serverId ?? null,
      streamIcon: opts.streamIcon ?? null,
      hostedExternally: true,
      isActive: true,
    },
  });
  await linkStreamToPluginBouquet(stream.id);
  return { created: true, id: stream.id };
}

function parseSpotifyPlaylistId(uri: string): string {
  const m = uri.match(/playlist[:/]([a-zA-Z0-9]+)/);
  return m?.[1] ?? uri.trim();
}

export async function importSpotifyPlaylist(integrationId: string, serverId?: string | null) {
  const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
  if (!row || row.type !== "spotify") throw new Error("Spotify integration not found");
  const cfg = row.config as Record<string, unknown>;
  const playlistId = parseSpotifyPlaylistId(String(cfg.playlistUri ?? ""));
  if (!playlistId) throw new Error("Spotify playlist URI required");

  let imported = 0;

  if (musicRelayBase(cfg)) {
    const relayTracks = await fetchSpotifyRelayPlaylist(cfg, playlistId);
    for (const track of relayTracks) {
      if (!track.id || !track.name) continue;
      const r = await upsertIntegrationStream({
        integrationId,
        type: "spotify",
        itemId: track.id,
        name: `${track.name} (Spotify)`,
        streamType: StreamType.LIVE,
        serverId,
        streamIcon: track.image ?? null,
      });
      if (r.created) imported++;
    }
    if (imported > 0) {
      await prisma.mediaIntegration.update({
        where: { id: integrationId },
        data: { lastSync: new Date() },
      });
      return { imported, bouquet: "Plugin imports", mode: "relay" };
    }
  }

  const token = await spotifyAccessToken(cfg);
  if (!token) throw new Error("Spotify auth failed — check Client ID / Secret / Refresh token");

  const res = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) }
  );
  if (!res.ok) throw new Error(`Spotify API ${res.status}`);
  const data = (await res.json()) as {
    items?: { track?: { id?: string; name?: string; preview_url?: string | null; album?: { images?: { url: string }[] } } | null }[];
  };

  for (const item of data.items ?? []) {
    const track = item.track;
    if (!track?.id || !track.name) continue;
    if (!track.preview_url && !musicRelayBase(cfg)) continue;
    const r = await upsertIntegrationStream({
      integrationId,
      type: "spotify",
      itemId: track.id,
      name: `${track.name} (Spotify)`,
      streamType: StreamType.LIVE,
      serverId,
      streamIcon: track.album?.images?.[0]?.url ?? null,
    });
    if (r.created) imported++;
  }

  await prisma.mediaIntegration.update({
    where: { id: integrationId },
    data: { lastSync: new Date() },
  });
  return {
    imported,
    bouquet: "Plugin imports",
    mode: musicRelayBase(cfg) ? "relay+preview" : "preview",
  };
}

export async function importAppleMusicPlaylist(integrationId: string, serverId?: string | null) {
  const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
  if (!row || row.type !== "apple_music") throw new Error("Apple Music integration not found");
  const cfg = row.config as Record<string, unknown>;
  const playlistId = String(cfg.playlistId ?? "").trim();
  if (!playlistId) throw new Error("Apple Music playlist ID required");

  const tracks = await fetchAppleMusicCatalogPlaylist(cfg, playlistId);
  if (!tracks.length) {
    throw new Error(
      "No tracks imported — check playlist ID, MusicKit keys, or relay URL (/apple-music/playlist/…/tracks)."
    );
  }

  let imported = 0;
  for (const track of tracks) {
    if (!track.id || !track.name) continue;
    const r = await upsertIntegrationStream({
      integrationId,
      type: "apple_music",
      itemId: track.id,
      name: `${track.name} (Apple Music)`,
      streamType: StreamType.LIVE,
      serverId,
      streamIcon: track.image ?? null,
    });
    if (r.created) imported++;
  }

  await prisma.mediaIntegration.update({
    where: { id: integrationId },
    data: { lastSync: new Date() },
  });
  return { imported, bouquet: "Plugin imports", mode: musicRelayBase(cfg) ? "relay" : "catalog" };
}

export async function importDeezerPlaylist(integrationId: string, serverId?: string | null) {
  const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
  if (!row || row.type !== "deezer") throw new Error("Deezer integration not found");
  const cfg = row.config as Record<string, unknown>;
  const playlistId = String(cfg.playlistId ?? "").trim();
  if (!playlistId) throw new Error("Deezer playlist ID required");

  let imported = 0;

  if (musicRelayBase(cfg)) {
    const relayTracks = await fetchDeezerRelayPlaylist(cfg, playlistId);
    for (const track of relayTracks) {
      if (!track.id || !track.name) continue;
      const r = await upsertIntegrationStream({
        integrationId,
        type: "deezer",
        itemId: track.id,
        name: `${track.name} (Deezer)`,
        streamType: StreamType.LIVE,
        serverId,
        streamIcon: track.image ?? null,
      });
      if (r.created) imported++;
    }
    await prisma.mediaIntegration.update({
      where: { id: integrationId },
      data: { lastSync: new Date() },
    });
    return { imported, bouquet: "Plugin imports", mode: "relay" };
  }

  const res = await fetch(`https://api.deezer.com/playlist/${playlistId}/tracks`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Deezer API ${res.status}`);
  const data = (await res.json()) as {
    data?: { id: number; title?: string; preview?: string; album?: { cover?: string } }[];
  };

  for (const track of data.data ?? []) {
    if (!track.title) continue;
    const r = await upsertIntegrationStream({
      integrationId,
      type: "deezer",
      itemId: String(track.id),
      name: `${track.title} (Deezer)`,
      streamType: StreamType.LIVE,
      serverId,
      streamIcon: track.album?.cover ?? null,
    });
    if (r.created) imported++;
  }

  await prisma.mediaIntegration.update({
    where: { id: integrationId },
    data: { lastSync: new Date() },
  });
  return { imported, bouquet: "Plugin imports", mode: "preview" };
}

export async function importYoutubeMusic(integrationId: string, serverId?: string | null) {
  const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
  if (!row || row.type !== "youtube_music") throw new Error("YouTube Music integration not found");
  const cfg = row.config as Record<string, unknown>;
  const relay = String(cfg.relayUrl ?? "").trim();
  if (relay) {
    const streamUrl = relay;
    const dup = await prisma.stream.findFirst({ where: { streamUrl, type: StreamType.LIVE } });
    if (!dup) {
      const s = await prisma.stream.create({
        data: {
          name: `${row.name} (YouTube Music)`,
          streamUrl,
          type: StreamType.LIVE,
          serverId: serverId ?? null,
          hostedExternally: true,
          isActive: true,
        },
      });
      await linkStreamToPluginBouquet(s.id);
    }
    await prisma.mediaIntegration.update({ where: { id: integrationId }, data: { lastSync: new Date() } });
    return { imported: 1, bouquet: "Plugin imports" };
  }

  const apiKey = String(cfg.apiKey ?? "").trim();
  const channelId = String(cfg.channelId ?? "").trim();
  if (!apiKey || !channelId) throw new Error("API key and channel/playlist ID required (or set relay HLS URL)");

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&type=video&maxResults=30&key=${encodeURIComponent(apiKey)}`,
    { signal: AbortSignal.timeout(30_000) }
  );
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  const data = (await res.json()) as {
    items?: { id?: { videoId?: string }; snippet?: { title?: string; thumbnails?: { default?: { url: string } } } }[];
  };

  let imported = 0;
  for (const item of data.items ?? []) {
    const videoId = item.id?.videoId;
    const title = item.snippet?.title;
    if (!videoId || !title) continue;
    const r = await upsertIntegrationStream({
      integrationId,
      type: "youtube_music",
      itemId: videoId,
      name: `${title} (YT Music)`,
      streamType: StreamType.LIVE,
      serverId,
      streamIcon: item.snippet?.thumbnails?.default?.url ?? null,
    });
    if (r.created) imported++;
  }

  await prisma.mediaIntegration.update({ where: { id: integrationId }, data: { lastSync: new Date() } });
  return { imported, bouquet: "Plugin imports" };
}

export async function importMusicAddon(integrationId: string, serverId?: string | null) {
  const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
  if (!row) throw new Error("Integration not found");
  switch (row.type) {
    case "spotify":
      return importSpotifyPlaylist(integrationId, serverId);
    case "apple_music":
      return importAppleMusicPlaylist(integrationId, serverId);
    case "deezer":
      return importDeezerPlaylist(integrationId, serverId);
    case "youtube_music":
      return importYoutubeMusic(integrationId, serverId);
    default:
      throw new Error(`No music import for type ${row.type}`);
  }
}
