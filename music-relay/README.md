# Nexlify Music Relay

Small Node service that resolves **full-length** Spotify and Apple Music stream URLs for the IPTV panel plugins. The panel calls this relay using the **Stream relay URL** field on each integration.

## API (matches panel `music-relay.ts`)

| Method | Path | Response |
|--------|------|----------|
| GET | `/health` | `{ ok: true }` |
| GET | `/spotify/playlist/:id/tracks` | `{ tracks: [{ id, name, previewUrl?, image? }] }` |
| GET | `/spotify/track/:id/stream` | `{ url: "https://..." }` |
| GET | `/apple-music/playlist/:id/tracks?storefront=us` | `{ tracks: [{ id, name, image? }] }` |
| GET | `/apple-music/song/:id/stream?storefront=us` | `{ url: "https://..." }` |

Pass `Authorization: Bearer <spotify-access-token>` for private Spotify playlists (panel does this automatically). Optional `x-relay-api-key` if `RELAY_API_KEY` is set.

## Requirements

On the relay host:

- **Node.js 20+**
- **yt-dlp** (`pip install yt-dlp` or system package)
- **spotdl** (recommended for Spotify): `pip install spotdl`
- **ffmpeg** (used by yt-dlp / spotdl)

## Quick start

```bash
cd music-relay
cp .env.example .env
# Edit .env — set RELAY_API_KEY and Spotify/Apple credentials

npm install
npm run dev
```

Test:

```bash
curl http://127.0.0.1:8788/health
curl -H "x-relay-api-key: YOUR_KEY" http://127.0.0.1:8788/spotify/track/TRACK_ID/stream
curl -H "x-relay-api-key: YOUR_KEY" http://127.0.0.1:8788/deezer/track/TRACK_ID/stream
```

## Panel configuration

On the IPTV panel integration page:

| Plugin | Relay URL example |
|--------|-------------------|
| Spotify | `https://relay.yourdomain.com` |
| Apple Music | `https://relay.yourdomain.com` |

Optional panel `.env`:

```env
MUSIC_RELAY_BASE_URL=https://relay.yourdomain.com
MUSIC_RELAY_API_KEY=same-as-RELAY_API_KEY
```

## Production (PM2)

```bash
npm run build
pm2 start dist/server.js --name music-relay
pm2 save
```

Put nginx in front with TLS:

```nginx
server {
    listen 443 ssl;
    server_name relay.nexlify.live;
    location / {
        proxy_pass http://127.0.0.1:8788;
        proxy_read_timeout 120s;
    }
}
```

## VPS install script

From the stream-billing repo on the server:

```bash
bash /var/www/nexlify/deploy/install-music-relay.sh
```

## Notes

- Spotify full streams depend on **spotdl** or **yt-dlp** support for the track/region.
- Apple Music playback varies by region and DRM; yt-dlp success is not guaranteed for every song.
- For production scale, run the relay on a dedicated stream server close to your panel.
