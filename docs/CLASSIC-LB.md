# Nexlify classic LB (modern XUI-style data plane)

Clean-room **nginx mainline + PHP 8.4-FPM + FFmpeg 8 + Redis + MariaDB**.
Control plane stays Next.js + PostgreSQL. Media never hairpins through Main.

## Architecture (stable at 50 → 50k)

```
Apps ──player_api──► Main (catalog / sticky server_info.url)
Apps ──/live MPEG-TS|HLS──► Classic LB
                              │
                              ├─ nginx auth_request → PHP auth (Redis-cached live-auth)
                              ├─ shared FFmpeg HLS packager (1 per active channel)
                              └─ MPEG-TS: per-client ffmpeg -c copy remux from local HLS
```

No Python fan-out process. One shared upstream ingest per channel; MPEG-TS viewers
are cheap local remuxes.

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

Then: `CLASSIC_LB_HOST=ip:8090 SET_TOPOLOGY=1 node scripts/ensure-classic-lb-server.cjs`
and `CLASSIC_LB_HOST=ip:8090 bash scripts/cutover-classic-lb.sh`.

## Endpoints

| Path | Role |
|------|------|
| `GET /lb/health` | Stack probe |
| `GET /lb/connections.json` | Panel Open Connections sync |
| `/live/{user}/{pass}/{id}.ts` | MPEG-TS remux (200, never 302) |
| `/live/.../.m3u8` | HLS playlist |

## Ops

- Smoke: `bash scripts/classic-lb/smoke.sh`
- Upgrade: `bash scripts/classic-lb/upgrade.sh`
- Idle FFmpeg reaper + `stop-node-edge.sh`

### nginx auth_request note

Use **content-phase** `proxy_pass` / `fastcgi_pass` with `$lb_safe` from
`auth_request_set`. Do not gate with rewrite-phase `if` / `rewrite` on that var.

See [STREAM-AGENT.md](./STREAM-AGENT.md) for panel-side FFmpeg agent control.
