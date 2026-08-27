# IPTV panel — production scale blueprint

Concrete Nexlify rollout for **stable playback**, **fast XCIPTV catalog refresh**, and a path to **20k+ concurrent viewers** without pushing video through Next.js workers.

This doc maps enterprise IPTV advice to **what this repo already ships** and **exact commands** to run on your servers.

---

## Target architecture

```text
                         ┌─────────────────────────────────────┐
  Smarters / XCIPTV      │  DNS (grey-cloud or stream-only)    │
  MAG / VLC / Web        │  darkcdn.store → edge pool          │
         │               └─────────────────┬───────────────────┘
         │                                 │
         ▼                                 ▼
┌─────────────────┐              ┌─────────────────┐
│ nginx :80/:443  │              │ nginx LB (opt.) │
│ panel UI + TLS  │              │ least_conn      │
└────────┬────────┘              └────────┬────────┘
         │                                │
         │ admin / login                  │ live / vod / player_api
         ▼                                ▼
┌─────────────────┐     auth only   ┌─────────────────────────┐
│ panel :13000    │◄───────────────│ nexlify-iptv-edge :8080  │
│ 4–6 PM2 workers │                 │ catalog cache, TS splice │
│ Postgres+Redis  │                 │ disk HLS, upstream pipe  │
└─────────────────┘                 └───────────┬─────────────┘
                                                │
                                                ▼
                                    provider CDN / HLS / TS URLs
```

**Rule:** Video bytes never touch `nexlify` PM2 cluster. Panel = auth, admin, credits, connections DB.

---

## Server roles

| Role | What runs | Postgres? | Typical box |
|------|-----------|-----------|-------------|
| **Panel** | `nexlify`, `nexlify-cron`, Redis, Postgres | Yes | 75, 85 (vendor) |
| **Monolithic** | Panel + edge on one VPS | Yes | 45 (customer) |
| **Stream edge** | `nexlify-iptv-edge`, nginx, optional stream agent | No | Extra nodes when scaling |

Register extra edges in **Admin → Servers** so reseller DNS and load metrics work.

---

## Phase 0 — Fix a broken box (e.g. server 45)

Run in order on the server:

```bash
cd /opt/nexlify-panel
git fetch origin main && git reset --hard origin/main

# 1) Canonical env + Redis + worker caps
bash scripts/ensure-panel-env.sh
bash scripts/tune-streaming-host.sh

# 2) Full streaming deploy (off-peak; or FORCE=1 during maintenance)
FORCE=1 bash scripts/apply-streaming-full-deploy.sh

# 3) Safeguards without rebuild (safe during live traffic)
bash scripts/apply-streaming-safeguards.sh

# 4) Verify playback
bash scripts/verify-iptv-playback.sh lucky15 chedpie30 http://127.0.0.1:8080
```

**Cloudflare 521 on `darkcdn.store`:** Origin must answer on the port CF proxies. Either:

- **Grey-cloud** the stream hostname (DNS only → edge IP), or
- nginx on :443/:80 must proxy to `127.0.0.1:8080` for Xtream paths (not an empty vhost).

See [Cloudflare / DNS](#cloudflare--dns) below.

**Dead channels (BBC One FHD):** Upstream URL returns HTML, not TS. Fix in DB — set `backupUrl` on affected `Stream` rows or run upstream audit (below).

---

## Phase 1 — Single-server production stack

One command applies env, kernel tuning, cron, nginx edge config, and optional full deploy:

```bash
cd /opt/nexlify-panel

# Safe during live traffic (no panel rebuild)
PHASE=safe bash scripts/apply-iptv-production-stack.sh

# Maintenance window — rebuild panel + edge
PHASE=full FORCE=1 bash scripts/apply-iptv-production-stack.sh
```

What this installs:

| Component | Script | Purpose |
|-----------|--------|---------|
| Production `.env` | `ensure-panel-env.sh` | Edge on :8080, panel on :13000, Redis, worker caps |
| OS / Redis tuning | `tune-streaming-host.sh` | somaxconn, Redis LRU |
| Stability cron | `install-streaming-stability-cron.sh` | Prune connections, watchdog, worker scale |
| nginx Xtream paths | `install-nginx-stream-edge.sh` | Proxy catalog to panel; edge owns IPTV ports |
| IPTV edge PM2 | `install-iptv-edge-proxy.sh` | `nexlify-iptv-edge` |
| Playback probe | `verify-iptv-playback.sh` | Live / VOD / series smoke test |

Copy and edit env template before first deploy:

```bash
cp scripts/iptv-production.env.example .env.production-notes
# merge needed keys into .env
```

---

## Phase 2 — Multi-edge (2k–10k viewers) — **NEXT**

One command on the LB host:

```bash
EDGE_IPS="45.88.138.18,75.119.137.174" \
STREAM_HOST=darkcdn.store \
bash scripts/apply-multi-edge-stack.sh
```

### Script index (Phase 2)

| Script | Run where | Purpose |
|--------|-----------|---------|
| `apply-multi-edge-stack.sh` | LB / panel nginx | Install LB + verify all edges |
| `install-multi-edge-lb.sh` | LB VPS | nginx `least_conn` upstream pool |
| `install-remote-edge-node.sh` | Each new edge VPS | Edge-only install → panel backend |
| `install-remote-stream-agent.sh` | Edge VPS | Agent heartbeat to panel |
| `sync-edge-fleet.sh` | Panel ops machine | SSH git pull + edge install on fleet |
| `verify-multi-edge-health.sh` | LB or panel | Probe every IP in `EDGE_IPS` |
| `install-edge-fleet-cron.sh` | Panel | Cron edge health every 5 min |
| `edge-node.env.example` | Edge VPS | Env template for remote nodes |

### Add each edge node

```bash
git clone … /opt/nexlify-panel
cd /opt/nexlify-panel
cp scripts/edge-node.env.example .env   # edit IPTV_EDGE_BACKEND + INTERNAL_API_SECRET
PANEL_BACKEND=10.0.0.5:13000 INTERNAL_API_SECRET=... bash scripts/install-remote-edge-node.sh
```

Optional agent (Admin → Servers → Generate token):

```bash
PANEL_URL=https://panel.example.com AGENT_TOKEN=... bash scripts/install-remote-stream-agent.sh
```

Fleet push from panel ops box (passwordless SSH):

```bash
EDGE_HOSTS="root@edge2,root@edge3" \
PANEL_BACKEND=10.0.0.5:13000 \
INTERNAL_API_SECRET=... \
bash scripts/sync-edge-fleet.sh
```

DNS: **grey-cloud** A record `darkcdn.store` → LB IP.

Windows: `windows/scripts/deploy-multi-edge-stack.ps1 -Host LB_IP -EdgeIps "45.88.138.18,75.119.137.174"`

Built-in panel LB: `src/lib/load-balancer.ts` + stream agents (`docs/STREAM-AGENT.md`).

---

## Phase 3 — 10k–20k+ viewers — **20K**

One command on the **panel** server:

```bash
VERIFY_USER=lucky15 VERIFY_PASS=secret \
EDGE_IPS="45.88.138.18,75.119.137.174,edge3,edge4" \
DB_PASS=your-db-password \
bash scripts/apply-20k-scale-stack.sh
```

### Script index (Phase 3)

| Script | Purpose |
|--------|---------|
| `apply-20k-scale-stack.sh` | Master: kernel, Redis, PgBouncer, multi-edge, verify |
| `iptv-20k.env.example` | Env template for 20k tier |
| `tune-kernel-20k.sh` | somaxconn, TCP buffers, file limits |
| `install-redis-production.sh` | 2 GB LRU, keepalive |
| `install-pgbouncer.sh` | Connection pooling → `:6432` |
| `install-postgres-read-replica.sh` | Primary + replica bootstrap |
| `verify-20k-readiness.sh` | Pre-flight checklist |
| `install-edge-fleet-cron.sh` | Automated edge + daily 20k check |

### 20k checklist

| Need | Action |
|------|--------|
| **4+ edge nodes** | `sync-edge-fleet.sh` + `EDGE_IPS` on LB |
| **DB pooling** | `install-pgbouncer.sh` → `DATABASE_URL=…6432…?pgbouncer=true` |
| **Read replica** | `install-postgres-read-replica.sh` on primary then replica |
| **Redis** | `install-redis-production.sh` (required) |
| **Kernel** | `tune-kernel-20k.sh` on every edge + panel |
| **Catalog** | Edge cache 10–15 min at 20k (`IPTV_EDGE_CATALOG_CACHE_MS=600000`) |
| **Connections** | `NEXLIFY_CONN_STALE_SEC=45`, prune cron |
| **Verify** | `verify-20k-readiness.sh` must PASS |

Target capacity (rule of thumb):

| Nodes | Approx concurrent viewers |
|-------|---------------------------|
| 1 edge (32 core) | 2k–4k (depends on upstream) |
| 2–3 edges + LB | 5k–10k |
| 4–6 edges + LB + PgBouncer | 15k–20k+ |

Windows: `windows/scripts/deploy-20k-stack-45.ps1 -Force`

**Skip:** P2P overlays, LL-HLS, multi-region BGP.

---

## Cloudflare / DNS

| Record | Proxy | Notes |
|--------|-------|-------|
| `panel.example.com` | Orange OK | Admin UI; short cache |
| `darkcdn.store` (IPTV) | **Grey cloud** recommended | Live TS/HLS breaks on CF cache; 521 if origin wrong |
| `player_api` / `live` | Never orange-cache | Dynamic auth |

**521 fix checklist:**

1. `curl -I https://darkcdn.store/player_api.php` from outside — expect 200/401, not 521.
2. On origin: `ss -tlnp | grep -E ':443|:80|:8080'`
3. nginx :443 must `proxy_pass http://127.0.0.1:8080` for Xtream locations OR grey-cloud to :8080.
4. Do **not** run IPTV edge on :443 when nginx owns Let's Encrypt for the same host.

---

## Environment reference

Full list: `scripts/iptv-production.env.example`.

Critical keys:

```env
NEXLIFY_USE_IPTV_EDGE=1
PORT=13000
STREAM_EDGE_PORT=8080
PANEL_INSTANCES=4
PANEL_BEHIND_NGINX=1

# Edge caches (ms)
IPTV_EDGE_AUTH_CACHE_MS=120000
IPTV_EDGE_CATALOG_CACHE_MS=300000
IPTV_EDGE_CATALOG_STALE_MS=600000

# HLS at edge
IPTV_EDGE_DISK_HLS_WAIT_MS=6000
IPTV_EDGE_HLS_SEG_WAIT_MS=12000
IPTV_EDGE_MAX_HLS_REMUX=64

# Connections
NEXLIFY_CONN_STALE_SEC=60
PLAYBACK_RATE_LIMIT_PER_MIN=120

REDIS_URL=redis://127.0.0.1:6379
```

---

## Verification

```bash
# Health
curl -s http://127.0.0.1:13000/api/health

# Full playback (user pass base-url)
bash scripts/verify-iptv-playback.sh USER PASS http://127.0.0.1:8080

# External (after DNS fix)
bash scripts/verify-iptv-playback.sh USER PASS https://darkcdn.store

# Upstream content audit (admin)
bash scripts/audit-live-upstream-health.sh
```

**Pass criteria:**

- Catalog: `get_live_streams` / `get_vod_streams` HTTP 200, &lt;3s warm
- Live `.ts`: HTTP 200, first byte `0x47`, &gt;100 KB in 10s
- Live `.m3u8` + `seg0.ts`: HTTP 200 (not 503/timeout)
- VOD / series: HTTP 206 on range request, valid container magic

---

## Content health (dead upstreams)

Symptom: m3u8 200 but seg0 503 or 0-byte TS.

```bash
bash scripts/audit-live-upstream-health.sh
```

Fix in admin or SQL: set working `backupUrl` on `Stream` rows where primary host returns HTML/404.

---

## Deploy matrix (your fleet)

| Server | IP | Role | Deploy command |
|--------|-----|------|----------------|
| **45** | 45.88.138.18 | Monolithic customer | `PHASE=full FORCE=1 bash scripts/apply-iptv-production-stack.sh` |
| **75** | 75.119.137.174 | Panel demo | Same; verify health after |
| **85** | 85.17.162.54 | Vendor / releases | `git pull && bash scripts/publish-panel-release.sh` |

Windows wrappers:

| Script | Purpose |
|--------|---------|
| `deploy-iptv-production-45.ps1` | Phase 1 production stack |
| `deploy-multi-edge-stack.ps1` | Phase 2 LB + edges |
| `deploy-20k-stack-45.ps1` | Phase 3 full 20k stack |

---

## Cron / ops (automatic)

Installed by `install-streaming-stability-cron.sh`:

| Schedule | Job |
|----------|-----|
| `* * * * *` | Prune stale `LiveConnection` |
| `*/2 * * * *` | Worker wedge guard |
| `*/5 * * * *` | Watchdog (PM2 health) |
| `*/10 * * * *` | Scale panel workers with load |

Logs: `/var/log/nexlify-prune-conn.log`, `nexlify-watchdog.log`, `nexlify-edge-health.log`, `nexlify-20k-check.log`

Installed by `install-edge-fleet-cron.sh` (Phase 2/3):

| Schedule | Job |
|----------|-----|
| `*/5 * * * *` | Multi-edge health (`verify-multi-edge-health.sh`) |
| `0 4 * * *` | Daily 20k readiness check |

---

## What not to do

- Scale `nexlify` PM2 to 16+ workers hoping video gets faster — it makes CPU/RAM worse.
- Orange-cloud live TS through Cloudflare.
- Run `next build` during peak — use `nexlify-streaming-guard.sh` or off-peak + `FORCE=1`.
- Proxy all HLS misses back to panel packager — edge must own disk HLS + bootstrap playlist.

---

## Related docs

- [OPS.md](./OPS.md) — DB, Redis, rate limits
- [NGINX.md](./NGINX.md) — Panel vs stream nginx
- [STREAM-AGENT.md](./STREAM-AGENT.md) — Remote edge agents
- [REDIS.md](./REDIS.md) — Cache layer
