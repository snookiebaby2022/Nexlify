# Load tests (k6)

Staging / local-only. **Never** point `LOAD_BASE_URL` at production 45 / darkcdn.

## Scenarios

| Name | Script | Intent |
|------|--------|--------|
| `player-api` | `scenarios/player-api-auth.js` | 1000 concurrent `player_api.php` auth, **p95 < 300ms** |
| `live-auth` | `scenarios/live-auth.js` | 5000 simultaneous `/api/internal/live-auth` checks |
| `m3u` | `scenarios/m3u-10k.js` | `get.php` M3U for ~10k channels |
| `credits` | `scenarios/credit-double-spend.js` | Concurrent line creates / credit debit |

Plus Prisma race (no k6): `npm run test:load:credit-race`.

## Setup

1. Install [k6](https://k6.io/docs/get-started/installation/).
2. Copy `.env.test.example` → `.env.test` (includes `PANEL_INTERNAL_SECRET`).
3. `npm run test:db:prepare`
4. `npm run test:load:seed` (creates 10k streams — set `LOAD_CHANNEL_COUNT=1000` for a smoke seed).
5. Start panel on test DB/port: `node tests/e2e/start-panel.mjs` (or your staging URL).
6. `LOAD_BASE_URL=http://127.0.0.1:13100 npm run test:load`

## Outputs

- `tests/load/reports/*.summary.json` — raw k6 summaries  
- `tests/load/reports/db-slow-queries.json` — `pg_stat_statements` / EXPLAIN  
- `tests/load/reports/LOAD-REPORT.md` — throughput, p50/p95/p99, error rate  
- `tests/load/SLOW-QUERIES.md` — curated top-10 + suggested indexes  

## Env knobs

See `config.env.example`. Scale down VUs on small machines:

```bash
LOAD_AUTH_VUS=100 LOAD_LIVE_AUTH_VUS=200 npm run test:load
```
