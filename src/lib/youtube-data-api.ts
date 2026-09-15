import { getSettingGroup, setSettingGroup } from "@/lib/panel-settings";

const YT_API = "https://www.googleapis.com/youtube/v3";

export async function getYoutubeDataApiKey(): Promise<string> {
  const env = process.env.YOUTUBE_DATA_API_KEY?.trim() ?? "";
  if (env) return env;
  const integrations = await getSettingGroup("integrations");
  return String(integrations.youtubeDataApiKey ?? "").trim();
}

export async function setYoutubeDataApiKey(key: string): Promise<void> {
  const integrations = await getSettingGroup("integrations");
  await setSettingGroup("integrations", { ...integrations, youtubeDataApiKey: key.trim() });
}

async function ytGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = await getYoutubeDataApiKey();
  if (!key) throw new Error("Add a YouTube Data API v3 key in Integrations or YOUTUBE_DATA_API_KEY");
  const url = new URL(`${YT_API}/${path}`);
  url.searchParams.set("key", key);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(data.error?.message || `YouTube API ${res.status}`);
  }
  return data;
}

export type YoutubeSearchHit = {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  hd: boolean;
};

export async function youtubeSearchVideos(opts: {
  q: string;
  maxResults?: number;
  hdOnly?: boolean;
}): Promise<YoutubeSearchHit[]> {
  const search = await ytGet<{
    items?: { id?: { videoId?: string }; snippet?: Record<string, string> }[];
  }>("search", {
    part: "snippet",
    type: "video",
    q: opts.q,
    maxResults: String(Math.min(25, Math.max(1, opts.maxResults ?? 12))),
    ...(opts.hdOnly ? { videoDefinition: "high" } : {}),
    safeSearch: "none",
  });
  const ids = (search.items ?? []).map((i) => i.id?.videoId).filter((id): id is string => Boolean(id));
  if (!ids.length) return [];

  const details = await ytGet<{
    items?: {
      id?: string;
      snippet?: Record<string, string>;
      contentDetails?: { definition?: string };
    }[];
  }>("videos", {
    part: "snippet,contentDetails",
    id: ids.join(","),
  });

  return (details.items ?? []).map((item) => ({
    videoId: String(item.id ?? ""),
    title: String(item.snippet?.title ?? item.id ?? ""),
    channelTitle: String(item.snippet?.channelTitle ?? ""),
    publishedAt: String(item.snippet?.publishedAt ?? ""),
    thumbnail: String(
      (item.snippet as { thumbnails?: { medium?: { url?: string }; default?: { url?: string } } } | undefined)
        ?.thumbnails?.medium?.url ??
        (item.snippet as { thumbnails?: { default?: { url?: string } } } | undefined)?.thumbnails?.default
          ?.url ??
        ""
    ),
    hd: item.contentDetails?.definition === "hd",
  }));
}

export type YoutubePlaylistHit = {
  playlistId: string;
  title: string;
  itemCount: number;
  thumbnail: string;
};

export async function youtubeSearchPlaylists(q: string, maxResults = 8): Promise<YoutubePlaylistHit[]> {
  const search = await ytGet<{
    items?: { id?: { playlistId?: string }; snippet?: Record<string, string> }[];
  }>("search", {
    part: "snippet",
    type: "playlist",
    q,
    maxResults: String(Math.min(15, Math.max(1, maxResults))),
  });
  const ids = (search.items ?? [])
    .map((i) => i.id?.playlistId)
    .filter((id): id is string => Boolean(id));
  if (!ids.length) return [];

  const details = await ytGet<{
    items?: {
      id?: string;
      snippet?: Record<string, string>;
      contentDetails?: { itemCount?: number };
    }[];
  }>("playlists", {
    part: "snippet,contentDetails",
    id: ids.join(","),
  });

  return (details.items ?? []).map((item) => ({
    playlistId: String(item.id ?? ""),
    title: String(item.snippet?.title ?? ""),
    itemCount: Number(item.contentDetails?.itemCount ?? 0),
    thumbnail: String(
      (item.snippet as { thumbnails?: { medium?: { url?: string } } } | undefined)?.thumbnails?.medium?.url ??
        ""
    ),
  }));
}

export async function youtubePlaylistVideoIds(playlistId: string, max = 40): Promise<string[]> {
  const data = await ytGet<{
    items?: { snippet?: { resourceId?: { videoId?: string } } }[];
  }>("playlistItems", {
    part: "snippet",
    playlistId,
    maxResults: String(Math.min(50, Math.max(1, max))),
  });
  return (data.items ?? [])
    .map((i) => i.snippet?.resourceId?.videoId)
    .filter((id): id is string => Boolean(id));
}
