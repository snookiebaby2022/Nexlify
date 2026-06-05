# Nexlify operations

## Database

**Recommended:** one PostgreSQL instance on the panel VPS for typical installs (1 panel + N stream servers).

A **read replica** is optional only when:

- The panel DB becomes a bottleneck (heavy reporting, many concurrent admins).
- You run multiple panel app nodes behind a load balancer.

Stream edge servers do **not** need Postgres. Redis is optional cache; **single Redis** is enough for most deployments ([REDIS.md](./REDIS.md)).

## Agent tokens

- Generate per server under **Servers → edit → Stream server agent**.
- **Rotate token** manually when needed (audit: `agent_token_rotated`).
- Optional auto-rotation for servers **not seen** in N days:

```env
# 0 = disabled (default). Example: rotate tokens on servers offline 90+ days
AGENT_TOKEN_ROTATE_DAYS=90
```

Hourly cron runs `jobAgentTokenRotation` when this is set.

## Fast stream loading

```env
# Max Xtream/live requests per line+IP per minute
PLAYBACK_RATE_LIMIT_PER_MIN=120

# Probe timeout (ms) — lower = faster admin checks
STREAM_PROBE_TIMEOUT_MS=4000
```

### What the panel does

| Area | Optimization |
|------|----------------|
| `/live/...` redirect | Single stream authorization query + **45s playback URL cache** (no full bouquet tree) |
| Connection limit | **5s cache** per line session count |
| Admin stream lists | `?lite=1` smaller payload |
| Probe | **Quick probe** (HEAD, 2.5–4s); **Full probe** for deep check |
| Player UI | **Play in browser** opens immediately (`playFirst`) |

## Health

```bash
curl -s https://panel.example.com/api/health
```

## Related

- [STREAM-AGENT.md](./STREAM-AGENT.md)
- [NGINX.md](./NGINX.md)
