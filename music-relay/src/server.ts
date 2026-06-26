import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { fetchApplePlaylistTracks, appleBearer } from "./apple-api.js";

function loadEnvFile() {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const text = readFileSync(resolve(root, ".env"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!(key in process.env) || process.env[key] === "") {
        process.env[key] = val;
      }
    }
  } catch {
    /* optional .env */
  }
}

loadEnvFile();
import {
  resolveAppleStreamUrl,
  resolveDeezerStreamUrl,
  resolveSpotifyStreamUrl,
} from "./cli.js";
import { fetchDeezerPlaylistTracks } from "./deezer-api.js";
import { fetchSpotifyPlaylistTracks, spotifyBearer } from "./spotify-api.js";

const app = express();
const PORT = Number(process.env.PORT ?? 8788);
const API_KEY = process.env.RELAY_API_KEY?.trim();

app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  if (!API_KEY || req.path === "/health") return next();
  const provided =
    req.header("x-relay-api-key") ??
    req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "nexlify-music-relay" });
});

app.get("/spotify/playlist/:id/tracks", async (req, res) => {
  try {
    const bearer = await spotifyBearer(req.header("authorization") ?? undefined);
    if (!bearer) {
      res.status(400).json({ error: "Spotify bearer token or relay env credentials required" });
      return;
    }
    const tracks = await fetchSpotifyPlaylistTracks(req.params.id, bearer);
    res.json({
      tracks: tracks.map((t) => ({
        id: t.id,
        name: t.name,
        previewUrl: t.previewUrl,
        image: t.image,
      })),
    });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : "Spotify playlist failed" });
  }
});

app.get("/spotify/track/:id/stream", async (req, res) => {
  const url = await resolveSpotifyStreamUrl(req.params.id);
  if (!url) {
    res.status(404).json({
      error: "No stream URL — install yt-dlp and/or spotdl on this host",
    });
    return;
  }
  res.json({ url });
});

app.get("/apple-music/playlist/:id/tracks", async (req, res) => {
  try {
    const bearer = await appleBearer(req.header("authorization") ?? undefined);
    if (!bearer) {
      res.status(400).json({ error: "Apple Music bearer or relay env MusicKit keys required" });
      return;
    }
    const storefront = String(req.query.storefront ?? "us");
    const tracks = await fetchApplePlaylistTracks(req.params.id, storefront, bearer);
    res.json({ tracks });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : "Apple playlist failed" });
  }
});

app.get("/apple-music/song/:id/stream", async (req, res) => {
  const storefront = String(req.query.storefront ?? "us");
  const url = await resolveAppleStreamUrl(storefront, req.params.id);
  if (!url) {
    res.status(404).json({
      error: "No stream URL — install yt-dlp on this host (Apple Music support varies)",
    });
    return;
  }
  res.json({ url });
});

app.get("/deezer/playlist/:id/tracks", async (req, res) => {
  try {
    const tracks = await fetchDeezerPlaylistTracks(req.params.id);
    res.json({ tracks });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : "Deezer playlist failed" });
  }
});

app.get("/deezer/track/:id/stream", async (req, res) => {
  const url = await resolveDeezerStreamUrl(req.params.id);
  if (!url) {
    res.status(404).json({
      error: "No stream URL — install yt-dlp and set DEEZER_ARL in relay .env for full tracks",
    });
    return;
  }
  res.json({ url });
});

app.listen(PORT, () => {
  console.log(`nexlify-music-relay listening on :${PORT}`);
});
