# Why Nexlify

Nexlify is built as a modern alternative to XUI.one, 1-stream, and Xtream UI.

## Stack & deployment

- **PostgreSQL-native** — same database family as 1-stream; live migration without MySQL conversion
- **Next.js 15 admin** — fast UI, stream probe player, responsive layout
- **Open deploy** — Docker Compose, PM2 scripts, documented VPS path (`docs/OPS.md`)
- **No vendor lock-in** — self-hosted panel and data

## Streaming & edges

- **Agent v2** — heartbeat, command queue, nginx snippet push, per-stream start/stop
- **Process monitor** — see edge ffmpeg/nginx health from the panel
- **Anti-Freeze technology** — live `proxy_buffering` off on edge agents, `X-Accel-Buffering: no` on `/live` redirects
- **Fast zapping** — Redis playback URL cache (configurable TTL) + neighbour-channel prefetch on channel play
- **Configurable fast playback** — `PLAYBACK_RATE_LIMIT_PER_MIN`, `STREAM_PROBE_TIMEOUT_MS`, optimized `/live` path

## Security & lines

- **Blocklists enforced** on playback (IP, ASN, ISP, user-agent)
- **Fingerprinted URLs** — optional HMAC on stream URLs (Settings → Fingerprint)
- **Country allow/block** per line + optional MaxMind GeoLite2
- **VPN/hosting block** — optional geo policy
- **Theft detection** — multi-line same IP alerts + optional auto-disable

## Business

- **WHMCS-style webhooks** — create, suspend, renew, terminate; downloadable WHMCS server module ZIP
- **Stalker geo on handshake** — same blocklist/country/VPN rules as Xtream playback
- **Plex HLS transcode profiles** — 1080p/720p/480p/direct with explicit bitrate caps
- **Packages & access codes** — reseller creates lines from packages or redeem codes
- **Credits & reseller tree** — standard reseller workflow

## Integrations

- **Panel migration** — XUI SQL, 1-stream PostgreSQL live, JSON interchange
- **Plex & YouTube** — import libraries / channels as stream entries
- **TMDB** — metadata on VOD add
- **M3U / folder import** — bulk channel and VOD ingest

## Operations

- **Server install wizard** — one-line agent bootstrap on new VPS
- **Domains & SSL** — Let’s Encrypt from settings
- **Cron jobs** — EPG sync, backups, import queue, server rebalance, agent restart
