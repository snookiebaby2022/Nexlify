# Nexlify classic LB (modern XUI-style data plane)

Clean-room **nginx mainline + PHP 8.4-FPM + FFmpeg 8 + Redis + MariaDB**.
Control plane stays Next.js + PostgreSQL. Media never hairpins through Main.

## Architecture (stable at 50 → 50k)

```
Apps ──player_api──► Main (catalog / sticky server_info.url)
Apps ──/live──► Main :80/:443/:8080  ──proxy──► Classic LB :8090  (XUI co-located)
         └──or──► Classic LB :8090 directly (internal) / optional LB Domain
                              │
                              ├─ nginx auth_request → PHP auth (Redis-cached live-auth)
                              ├─ shared FFmpeg HLS packager (1 per active channel)
                              └─ MPEG-TS: per-client ffmpeg -c copy remux from local HLS
```

XUI-style: **Main and LB both play** on standard ports **80 / 8080 / 443** (plus any
extra ports you add on the StreamServer). `server_info.port` is never the internal
classic-lb listen (`8090`). Same login domain works for streams assigned to the LB;
set an optional **LB Domain Name** only if you want a dedicated stream hostname.

Media never hairpins through Next.js. Proxy buffering is off end-to-end.

| Concurrent viewers | Recommendation |
|--------------------|----------------|
| ≤ ~2k / box | Single LB, `CONNECTION_HANDLER=mysql` |
| 2k–10k / box | Same box + `CONNECTION_HANDLER=redis`, prefer HLS clients |
| 10k–50k | **Horizontal LBs** (multiple StreamServer `lb` rows) + Redis |

## Install (LB host — often co-located with Main)

```bash
export PANEL_URL="http://127.0.0.1:13000"   # or public panel URL
export PANEL_INTERNAL_SECRET="<from panel .env>"
export LB_SERVER_ID="<StreamServer id>"
sudo bash scripts/classic-lb/install.sh
```

Install copies nginx/PHP pool templates and **strips a UTF-8 BOM** if present (Windows editors). A BOM makes nginx fail with `unknown directive` on the first line — fixed in `install.sh` so customer installs are safe.

Then: `CLASSIC_LB_HOST=ip:8090 SET_TOPOLOGY=1 node scripts/ensure-classic-lb-server.cjs`
and `CLASSIC_LB_HOST=ip:8090 bash scripts/cutover-classic-lb.sh`.

Install applies a **50k-subscriber profile** sized to *this* machine's RAM/CPU (PHP-FPM media/auth pools, nginx `worker_connections 65535`, kernel BBR, Redis `tcp-backlog`). A small VPS will not be given 1024 media workers (it would OOM). A dedicated 32 GB LB will.

**Adding LBs:** run the same `classic-lb/install.sh` on each new stream server. Each box is tuned independently; 50k lines is horizontal (many LBs), not one oversized pool. Re-apply after adding RAM:

```bash
sudo bash scripts/tune-capacity-50k.sh
```

## Endpoints

| Path | Role |
|------|------|
| `GET /lb/health` | Stack probe |
| `GET /lb/connections.json` | Panel Open Connections sync |
| `/live/{user}/{pass}/{id}.ts` | MPEG-TS remux (200, never 302) |
| `/live/.../.m3u8` | Auth'd playlist; segments signed via `/lb/hls/{safe}/segN.ts?e=&t=` |
| `/lb/hls/{safe}/segN.ts` | HMAC-signed HLS segment (packager stays localhost-only) |

## Ops

- Smoke: `bash scripts/classic-lb/smoke.sh`
- Upgrade: `bash scripts/classic-lb/upgrade.sh`
- Idle FFmpeg reaper + `stop-node-edge.sh`

### Signed HLS

FFmpeg writes under `/var/lib/nexlify-lb/hls` on `127.0.0.1:8092` only.
Public clients never hit that port. After `auth_request`, `hls_playlist.php`
rewrites each `segN.ts` to `/lb/hls/{safe}/segN.ts?e=&t=` (HMAC-SHA256 of
`safe|seg|exp` with `HLS_SIGN_SECRET` or `AGENT_TOKEN`). Segment fetch skips
panel live-auth.

### nginx auth_request note

Use **content-phase** `proxy_pass` / `fastcgi_pass` with `$lb_safe` from
`auth_request_set`. Do not gate with rewrite-phase `if` / `rewrite` on that var.

See [STREAM-AGENT.md](./STREAM-AGENT.md) for panel-side FFmpeg agent control.
