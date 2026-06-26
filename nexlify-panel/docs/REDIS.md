# Redis for Nexlify Panel

Nexlify uses Redis optionally for shared API cache (stats, EPG, categories) when the panel runs under multiple PM2 workers or separate app processes. Stream servers **do not** need Redis.

## Single instance (recommended)

Use this for the typical deployment: **one panel VPS** plus **N stream servers**.

```env
REDIS_URL=redis://127.0.0.1:6379
```

- Install Redis on the panel host or use a small managed Redis (same region as the panel).
- One instance handles thousands of lines and hundreds of concurrent API reads easily.
- Lower operational cost and simpler backups than cluster mode.

Configure under **Admin → Settings → Cache & Redis** with `redisMode: single`.

## Redis Cluster (advanced)

Use cluster mode only when:

- You run **multiple panel app nodes** behind a load balancer that must share the same cache keys, or
- Your provider mandates Redis Cluster for HA at very large scale.

```env
# Do not set REDIS_URL when using cluster nodes list
REDIS_CLUSTER_NODES=10.0.0.1:6379,10.0.0.2:6379,10.0.0.3:6379
```

Document planned nodes in **Settings → Cache → Cluster nodes**. The panel reads `REDIS_CLUSTER_NODES` at startup via `ioredis` Cluster client.

## In-memory fallback

If neither `REDIS_URL` nor `REDIS_CLUSTER_NODES` is set, Nexlify falls back to in-process memory cache. This is fine for local dev and single-worker installs.

## Stream server Redis

Bundled Redis under `/home/nexlify/bin/redis` on stream servers is for **edge daemons**, not the Nexlify panel cache. Panel cache Redis lives on the panel machine only.

## Tuning on a VPS

| Setting | Suggestion |
|---------|------------|
| `maxmemory` | 128–256 MB for panel cache |
| `maxmemory-policy` | `allkeys-lru` |
| Persistence | `save ""` optional — cache can be cold after restart |
| Firewall | Bind Redis to `127.0.0.1` or private VPC only |

After changing Redis env vars, restart the panel process (`pm2 restart nexlify` or `npm run dev`).
