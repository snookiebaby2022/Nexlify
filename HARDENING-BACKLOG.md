# Hardening backlog (not fully automated in-app)

Implemented in code (2026-09-10 pass): capacity fail-closed, Redis connection slots
(`REDIS_SLOTS_URL`), edge slot hard-deny + deny cache purge, assertPlaybackAllowed
capacity, LiveConnection unique upsert, playback-guard timeout fail-closed,
timed-token default TTL + optional `requirePlaybackToken`, admin 2FA default-on,
trial IP quotas, EPG staging swap, nginx workers/limit_req + proxy_cache snippet,
Prisma pool default 20, live-routing drift CI check.

## Still requires ops / larger projects

| Item | Why deferred |
|------|----------------|
| Native FFmpeg agent (Go/C++) | New binary + deploy pipeline; keep Node agent for now |
| Hash line passwords | Breaks XC `/live/user/pass/id` unless dual opaque IDs |
| live-auth sidecar service | Separate process + edge config cutover |
| Panel-down multi-hour survival | Needs edge-local signed deny lists + longer TTL design |
| Force `requirePlaybackToken` globally | Opt-in in Settings → Streams (breaks stock Xtream apps) |
| Live-routing lock on every VPS | Run `scripts/lock-live-routing-45.sh` / drift `--host` on boxes |

## Operator toggles

- `NEXLIFY_CAPACITY_FAIL_OPEN=1` — restore legacy fail-open (not recommended)
- `REDIS_SLOTS_URL` — dedicated slots Redis (recommended with `noeviction`)
- `NEXLIFY_DB_CONNECTION_LIMIT` — Prisma pool size (default 20)
- Settings → Security → require admin TOTP (default true for new installs)
- Settings → Streams → `playbackTokenTtlSec` / `requirePlaybackToken`
- Settings → General → `trialMaxPerIpPerDay` (default 3)

## Deploy on panel host

```bash
cd /opt/nexlify-panel
git pull   # or rsync this tree
bash scripts/apply-hardening-ops.sh
# on server 45 only:
bash scripts/lock-live-routing-45.sh
bash scripts/check-live-routing-drift.sh --host
```

On each LB/edge: copy `scripts/iptv-edge-proxy.mjs` + `scripts/edge-redis-slots.mjs`,
set `REDIS_SLOTS_URL` (or `REDIS_URL` reachable to panel Redis), `pm2 restart` edge.
