# Nexlify panel licensing



## License plans (fixed terms)



| Term | Duration |

|------|----------|

| `1m` | 1 month (30 days) |

| `3m` | 3 months (90 days) |

| `6m` | 6 months (180 days) |

| `1y` | 1 year (365 days) |



## Main server activation



Run the **license server** on your **main** Nexlify VPS (same host as your vendor panel, or a dedicated license host). Every customer panel must use:



```env

NEXLIFY_LICENSE_API_URL=http://YOUR_MAIN_IP:8787

NEXLIFY_LICENSE_REQUIRE_ONLINE=1

```



When a customer activates at **Admin → License**, the panel calls `POST /v1/activate` on that server. Each key can only bind to **one** `instance_id` (one installation).



Remove `NEXLIFY_LICENSE_SKIP=1` in production.



## Vendor setup (once)



```bash

npm run license:setup

```



Keeps `.license-keys/private.pem` on the **main server only** (never sync to customers).



### Start license server (PM2 on main VPS)



Copy `private.pem` to `/home/nexlify-panel/.license-keys/private.pem`, then in `.env`:



```env

LICENSE_SERVER_PORT=8787

LICENSE_SERVER_API_SECRET=your-long-random-secret

```



```bash

./scripts/pm2-start.sh

# Starts nexlify + nexlify-license (if private.pem exists)

```



Or manually:



```bash

LICENSE_SERVER_API_SECRET=your-secret npm run license:server

```



## Issue keys



### CLI (main server or dev PC with private.pem)



```bash

npm run license:issue -- --email customer@example.com --term 3m

npm run license:issue -- --email x@y.com --term 1y --bind

```



Terms: `1m` | `3m` | `6m` | `1y`



### HTTP API (automated billing / WHMCS)



```bash

curl -X POST http://YOUR_MAIN_IP:8787/v1/issue \

  -H "Content-Type: application/json" \

  -H "X-License-Secret: YOUR_LICENSE_SERVER_API_SECRET" \

  -d '{"email":"buyer@example.com","term":"6m","bind":true}'

```



Response: `{ "ok": true, "license_key": "NXLF1...", "term": "6m", "expires_at": "..." }`



List terms: `GET /v1/terms`



## Customer activation



1. **Admin → License** — paste `NXLF1...` key  

2. Panel verifies signature locally, then registers with main server  

3. Session cookie set; admin/reseller UI unlocked  



## Environment variables



| Variable | Purpose |

|----------|---------|

| `NEXLIFY_LICENSE_API_URL` | Main license server URL (required for online activation) |

| `NEXLIFY_LICENSE_REQUIRE_ONLINE` | `1` = refuse activation if API URL missing |

| `NEXLIFY_LICENSE_KEY` | Full key in `.env` (air-gap) |

| `NEXLIFY_LICENSE_SKIP` | `1` = dev only, disables checks |

| `LICENSE_SERVER_API_SECRET` | Protects `POST /v1/issue` on main server |

| `LICENSE_SERVER_PORT` | Default `8787` |



## Security note



Signed keys cannot be forged without `private.pem`. Root access on a customer VPS can still patch code — use online activation + instance binding to limit key sharing.

