import { NextRequest, NextResponse } from "next/server";
import { PanelRole } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { parseJsonBody } from "@/lib/parse-json-body";
import {
  getYoutubeDataApiKey,
  setYoutubeDataApiKey,
  youtubePlaylistVideoIds,
  youtubeSearchPlaylists,
  youtubeSearchVideos,
} from "@/lib/youtube-data-api";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const hd = req.nextUrl.searchParams.get("hd") === "1";
  const playlists = req.nextUrl.searchParams.get("playlists") === "1";
  if (!q) {
    const key = await getYoutubeDataApiKey();
    return NextResponse.json({ configured: Boolean(key), videos: [], playlists: [] });
  }
  try {
    if (playlists) {
      const items = await youtubeSearchPlaylists(q);
      return NextResponse.json({ playlists: items, videos: [] });
    }
    const videos = await youtubeSearchVideos({ q, hdOnly: hd });
    return NextResponse.json({ videos, playlists: [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "YouTube search failed" },
      { status: 400 }
    );
  }
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = await parseJsonBody<{
    apiKey?: unknown;
    playlistId?: unknown;
  }>(req);
  if (!parsed.ok) return parsed.response;
  if (parsed.data.apiKey != null) {
    await setYoutubeDataApiKey(String(parsed.data.apiKey));
    return NextResponse.json({ ok: true, configured: Boolean(String(parsed.data.apiKey).trim()) });
  }
  const playlistId = String(parsed.data.playlistId ?? "").trim();
  if (!playlistId) return NextResponse.json({ error: "playlistId or apiKey required" }, { status: 400 });
  try {
    const videoIds = await youtubePlaylistVideoIds(playlistId);
    return NextResponse.json({ videoIds });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Playlist import failed" },
      { status: 400 }
    );
  }
}
