import { prisma } from "@/lib/prisma";
import {
  buildPlexTranscodeM3u8,
  resolvePlexProfile,
} from "@/lib/plex-playback";
import { parseIntegrationStreamUrl } from "@/lib/integration-stream-url";
import {
  resolveAppleRelayStream,
  resolveDeezerRelayStream,
  resolveSpotifyRelayStream,
  spotifyAccessToken,
} from "@/lib/music-relay";

function normalizeEmbyBase(url: string, type: "emby" | "jellyfin") {
  const trimmed = url.replace(/\/$/, "");
  if (trimmed.endsWith("/emby") || trimmed.endsWith("/jellyfin")) return trimmed;
  return type === "emby" ? `${trimmed}/emby` : trimmed;
}

async function getIntegration(integrationId: string) {
  return prisma.mediaIntegration.findUnique({
    where: { id: integrationId, isActive: true },
  });
}

async function resolveInvidiousHls(videoId: string): Promise<string | null> {
  const instances = [
    process.env.INVIDIOUS_INSTANCE,
    "https://yewtu.be",
    "https://invidious.nerdvpn.de",
  ].filter(Boolean) as string[];

  for (const base of instances) {
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/api/v1/videos/${videoId}`, {
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        formatStreams?: { url: string; quality: string; type: string }[];
      };
      const hls = data.formatStreams?.find((f) => f.type === "hls" || f.quality?.includes("720"));
      if (hls?.url) return hls.url;
      const any = data.formatStreams?.[0]?.url;
      if (any) return any;
    } catch {
      continue;
    }
  }
  return null;
}

export async function resolveIntegrationPlaybackUrl(streamUrl: string): Promise<string | null> {
  const parsed = parseIntegrationStreamUrl(streamUrl);
  if (!parsed) return null;

  const row = await getIntegration(parsed.integrationId);
  if (!row) return null;
  const cfg = (row.config ?? {}) as Record<string, unknown>;

  switch (parsed.type) {
    case "plex": {
      const base = String(cfg.url ?? "").replace(/\/$/, "");
      const token = String(cfg.token ?? "");
      if (!base || !token) return null;
      const profile = resolvePlexProfile(cfg.transcodeProfile ?? "1080p");
      return buildPlexTranscodeM3u8(base, token, parsed.itemId, profile);
    }

    case "emby":
    case "jellyfin": {
      const base = normalizeEmbyBase(String(cfg.url ?? ""), parsed.type);
      const token = String(cfg.token ?? "");
      if (!base || !token) return null;
      return `${base}/Videos/${parsed.itemId}/master.m3u8?api_key=${encodeURIComponent(token)}`;
    }

    case "spotify": {
      const relayStream = await resolveSpotifyRelayStream(cfg, parsed.itemId);
      if (relayStream) return relayStream;
      const token = await spotifyAccessToken(cfg);
      if (!token) return null;
      const res = await fetch(`https://api.spotify.com/v1/tracks/${parsed.itemId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) return null;
      const track = (await res.json()) as { preview_url?: string | null };
      return track.preview_url ?? null;
    }

    case "apple_music": {
      const relayStream = await resolveAppleRelayStream(cfg, parsed.itemId);
      if (relayStream) return relayStream;
      return null;
    }

    case "deezer": {
      const relayStream = await resolveDeezerRelayStream(cfg, parsed.itemId);
      if (relayStream) return relayStream;
      const res = await fetch(`https://api.deezer.com/track/${parsed.itemId}`, {
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) return null;
      const track = (await res.json()) as { preview?: string };
      return track.preview ?? null;
    }

    case "youtube":
    case "youtube_music": {
      const relay = String(cfg.relayUrl ?? "").trim();
      if (relay && parsed.type === "youtube_music") return relay;
      let videoId = parsed.itemId;
      if (videoId === "channel") {
        const channelUrl = String(cfg.channelUrl ?? cfg.url ?? "");
        const m = channelUrl.match(/channel\/([^/?]+)/i);
        if (m) {
          const rss = await fetch(
            `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(m[1])}`,
            { signal: AbortSignal.timeout(15_000) }
          );
          if (rss.ok) {
            const xml = await rss.text();
            const vid = xml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
            if (vid) videoId = vid[1];
          }
        }
      }
      const hls = await resolveInvidiousHls(videoId);
      if (hls) return hls;
      return `https://www.youtube.com/watch?v=${videoId}`;
    }

    default:
      return null;
  }
}
