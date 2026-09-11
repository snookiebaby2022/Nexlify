# Nexlify TESTPLAN (Phase 1 — Recon only)

Generated for the **nexlify-panel** IPTV management panel. No production source was changed in this phase.

**Stack note for later phases:** This is **Next.js App Router + Prisma/Postgres**, not Express/Laravel. Prefer extending the existing **`tsx --test` (Node.js native test runner)** harness over installing Jest/Vitest unless we deliberately migrate. There is already substantial unit coverage under `src/lib/*.test.ts`.

---

## 1. Detected stack

| Layer | Choice |
|--------|--------|
| Language | TypeScript 5.8 |
| Runtime | Node ≥ 18.17 |
| App framework | **Next.js 15.5** (App Router) + React 19 |
| Package manager | npm (`package-lock.json`) |
| ORM / DB | **Prisma 6.9** → **PostgreSQL** (`pg`) |
| Cache | **Redis** (`ioredis`) |
| Auth | JWT (`jose`) in cookie `nexlify_session`; bcrypt passwords |
| Background | PM2 processes: panel cluster, `nexlify-cron`, HLS helpers, optional IPTV edge |
| Web server (prod) | **nginx** → Next on `127.0.0.1:13000`; media on remote edge / LB |
| Streaming | Custom **iptv-edge** splice proxy, FFmpeg/ffprobe, HLS/MPEG-TS |
| UI | Tailwind 3, Lucide, Recharts, hls.js / mpegts.js |
| Extra packages in monorepo | `marketing-drop-in/` (nexlify.live), `license-server/`, many `scripts/` ops tools |
| Test runner today | **`tsx --test`** via `npm test` / `pretest` — **no Jest/Vitest config** |
| Coverage tooling | **None** configured yet (no c8/istanbul threshold) |
| E2E | **No Playwright/Cypress** in package.json |
| Load | k6 scenarios in `tests/load/` (staging only; not prod 45) |

**Roles (`PanelRole`):** `ADMIN` · `RESELLER` · `SUB_RESELLER` · `STAFF`

---

## 2. Module inventory

### Panel core (`src/`)

| Module | Where it lives | Notes |
|--------|----------------|-------|
| Auth / sessions | `src/lib/auth.ts`, `src/middleware.ts`, `src/app/api/auth/` | Cookie JWT; IP-bind / bot stealth options |
| Admin UI | `src/app/admin/**` (~428 pages app-wide) | Large surface |
| Reseller UI | `src/app/reseller/**` | Scoped lines/credits/MAG |
| Staff permissions | `src/lib/staff-permissions.ts` | Fine-grained staff caps |
| Users / resellers / credits | `PanelUser`, `CreditTransaction`, `/api/admin/credits`, reseller credit charge | Revenue-critical |
| Lines / subscriptions | `Line`, `/api/admin/lines`, `/api/reseller/...`, packages | Status, expiry, maxConnections |
| Bouquets | `Bouquet`, `LineBouquet`, `ResellerBouquet` | Catalog ACL |
| Streams / categories | `Stream`, `Category`, providers, watch folders | LIVE / VOD / SERIES |
| Series / VOD / episodes | admin movies/series/episodes APIs | Xtream VOD/series actions |
| EPG | `EpgSource`, `EpgProgram`, xmltv export, auto-match | XMLTV + short EPG |
| MAG / Enigma / STB | `MagDevice`, `EnigmaDevice`, stalker portal `/c/` | Stalker middleware |
| Connections / kick / capacity | `LiveConnection`, connections APIs | max_connections enforcement |
| Load balancers / servers | `StreamServer`, LB sessions, DNS rotator | Media origin / 10G LB |
| Billing / shop / coupons | billing APIs, shop, packages, access codes | Stripe-ish + credits |
| Logs / tickets / AI | ActivityLog, tickets, AI support libs | |
| Panel update / license | panel-update, license cookies, fleet sync | Vendor marketing on 85 |
| Import / migrate / mass-edit | XUI migration, M3U sync, mass jobs | Dangerous write paths |
| Security blocklists | IP/ASN/ISP/UA, same-IP, fingerprint | Playback guards |
| DVR / catchup / timeshift | DVR models + routes | |
| Plex / TMDB / artwork | integrations | Optional |
| Public Xtream API | `player_api.php`, `panel_api.php`, `get.php`, `xmltv.php` | Client-critical |
| Playback paths | `/live`, `/movie`, `/series`, `/timeshift` | nginx lock: panel must not 302 media |

### Sibling systems

| System | Path | Test relevance |
|--------|------|----------------|
| Marketing / install site | `marketing-drop-in/` | Separate Next app; licenses, installers |
| License server | `license-server/server.mjs` | Panel activation |
| Edge proxy | `scripts/iptv-edge-proxy.mjs` | Live splice; parity test exists |
| Ops / deploy | `scripts/*.sh`, `*.cjs` | Smoke/stress only — not unit-test target |

---

## 3. HTTP surface (inventory strategy)

**Scale:** ~**342** `route.ts` handlers under `src/app/api/` alone, plus App Router pages and PHP-compat routes at app root.

### 3.1 Public / IPTV client (no panel session)

| Method | Path | Auth | Key params |
|--------|------|------|------------|
| GET/POST | `/player_api.php` | line user/pass | `username`, `password`, `action`, `category_id`, `vod_id`, `series_id`, `stream_id` |
| GET/POST | `/panel_api.php` | line / panel compat | Xtream panel_api subset |
| GET | `/get.php` | line user/pass | `type=m3u_plus`, `output=ts\|hls`, username/password |
| GET | `/xmltv.php` | line user/pass | username/password |
| GET | `/live/{user}/{pass}/{id}[.ts\|.m3u8]` | path credentials | stream id |
| GET | `/movie/...`, `/series/...`, `/timeshift/...` | path credentials | |
| * | `/c/`, `/stalker_portal/` | MAG/Stalker | portal token / MAC flows |
| GET | `/api/health` | none | |
| GET | `/login` | none | UI |
| * | `/api/public/*`, `/api/shop/*`, `/api/billing/*` (partial) | varies | shop/checkout |

**`player_api.php` actions implemented:**  
`get_live_categories`, `get_live_streams`, `get_vod_categories`, `get_vod_streams`, `get_vod_info`, `get_series_categories`, `get_series`, `get_series_info`, `get_short_epg`, `get_epg`, `get_simple_data_table`, `get_account_info` / `get_user_info`, `get_server_info`, `get_bouquets`, plus bare auth (no `action`).

### 3.2 Panel session APIs (cookie JWT)

| Prefix | Count (approx) | Auth pattern |
|--------|----------------|--------------|
| `/api/admin/**` | **254** | `requireSession` / `guardAdminApiRequest` (ADMIN or permitted STAFF) |
| `/api/reseller/**` | **23** | RESELLER / SUB_RESELLER |
| `/api/lines/**` | 8 | line-facing / mixed |
| `/api/auth/**` | 2 | login/logout |
| `/api/panel/**`, `/api/license/**`, `/api/internal/**`, `/api/agent/**`, … | remainder | service keys / cron / agent |

**Admin API domains (folders under `/api/admin/`):**  
lines, streams, categories, bouquets, packages, resellers, credits, mag, enigma, epg, servers, connections, settings, migrate, import, tickets, billing, CDN, DVR, AI, security-*, stream-*, etc. (100+ resource folders).

**Auth requirement summary:**

- Most `/api/admin/*` → admin/staff + CSRF/security headers via middleware.
- Reseller routes → role check + **owner-scoped queries** (must be regression-tested for IDOR).
- Xtream/playback → line credentials + `assertPlaybackAllowed` (IP/UA/country/rate/maxConnections).

> Full per-route param docs for all 342 handlers is a Phase 4 deliverable (generate from AST or OpenAPI dump). This plan ranks modules; do not hand-maintain a 342-row table until an inventory script exists.

### 3.3 Middleware concerns (`src/middleware.ts`)

- JWT verify on protected UI/API
- Host allowlist / stealth panel / bot block
- License / trial cookies
- Demo-host mutation blocks
- Admin API rate limit
- Playback paths treated specially (must stay compatible with Xtream apps)

---

## 4. Database (Prisma)

**~77 models** in `prisma/schema.prisma`. Core graph:

```
PanelUser (ADMIN|RESELLER|SUB_RESELLER|STAFF)
  ├─ credits, parent/upline, maxLines, ResellerBouquet, CreditTransaction
  └─ Line (ownerId)
        ├─ LineBouquet → Bouquet → BouquetStream → Stream
        ├─ MagDevice / EnigmaDevice
        ├─ LiveConnection / LoadBalancerSession
        └─ DeviceBinding, fingerprints, watches…

Stream → Category, StreamServer, StreamProvider, health/issues
EpgSource → EpgProgram (↔ streams via epg ids)
Package / AccessCode → line create billing
Ticket*, BillingEvent, ActivityLog, PanelSetting
```

**Relationships to assert in Phase 6:** cascade deletes (reseller → lines?), bouquet membership integrity, credit ledger vs `PanelUser.credits`, connection rows vs `maxConnections`, package→bouquet defaults.

**Seed today:** `prisma/seed.ts` — minimal admin (+ optional reseller). Needs expansion for factories (Phase 2).

---

## 5. External integrations

| Integration | Usage | Mock strategy |
|-------------|-------|---------------|
| FFmpeg / ffprobe | Transcode, probe, overlays | Mock argv builders + child_process |
| nginx / edge splice | Live routing, LB | Contract tests + edge-proxy parity |
| Xtream Codes client API | player_api / get.php / xmltv | Golden JSON/XML/M3U fixtures |
| Redis | Catalog cache, rate limits | ioredis mock or testcontainer |
| Postgres | All durable state | Isolated test DB |
| SMTP (`nodemailer`) | Notifications | Capture transport |
| OpenAI | AI support / insights | Mock HTTP |
| SSH (`ssh2`) | Remote server detect/metrics | Mock |
| Plex / TMDB | Catalog/artwork | Mock HTTP |
| GeoIP (`mmdb-lib`) | Country/ISP rules | Fixture DB |
| License server / marketing sync | Activation | Mock or local stub |
| Payment / shop | Coupons, billing events | Mock gateways |
| Cloudflare (ops) | DNS/CDN in front of domains | Out of unit scope; smoke only |

---

## 6. Existing test coverage

### Framework

- **Runner:** Node native tests via **`tsx --test`**
- **Entry:** `npm test` lists ~100+ explicit `src/lib/*.test.ts` files (plus a few marketing/script tests)
- **No** Jest/Vitest/Playwright/c8 coverage gate in CI from package.json alone

### What is already covered (strongest areas)

Unit-style tests around:

- Xtream helpers (`xtream-safe`, `xtream-unauth`, request params, playback paths)
- Playback / live session / HLS auth / export-playback-url / media origin
- Reseller permissions / bouquets / DNS / line restrictions
- EPG parse/time, M3U parser, SSRF helpers
- Connections capacity/kick, password verify, panel update modes
- Edge proxy parity (`scripts/edge-proxy-parity.test.mjs`)

### Gaps (high level)

| Area | Coverage today |
|------|----------------|
| HTTP route integration (`/api/admin/*`, reseller) | Almost none |
| Full `player_api` action matrix vs real DB | Partial libs only |
| Credit debit race / concurrent line create | Logic exists; no concurrency tests |
| Playwright E2E admin/reseller | None |
| Coverage % reporting | None |
| Marketing + license-server | Tiny / none |
| FFmpeg argv injection | Some agent tests; needs systematic matrix |

**Rough ratio:** ~**526** `src/lib` `.ts` files vs ~**123** `*.test.ts` → ~23% of lib files have a sibling test; **API routes ~0%** integration coverage.

---

## 7. Top 20 riskiest untested (or under-tested) paths

Ranked by revenue / security / customer outage risk:

1. **`player_api.php` auth + action switch** — wrong JSON shape breaks every IPTV app; expired/disabled/banned lines; UA profiles.  
2. **`get.php` M3U generation** — huge catalogs, bouquet filtering, stream URL host (media origin / LB IP).  
3. **`assertPlaybackAllowed` + max_connections** — N+1 concurrent connects; stale connection self-heal.  
4. **`debitResellerCredits` inside line-create transactions** — parallel creates must not drive credits negative.  
5. **Reseller IDOR on `/api/reseller/*` and admin line APIs when called as reseller** — cross-tenant read/write.  
6. **`/api/admin/credits` add/deduct/refund** — privilege + arithmetic + ledger consistency.  
7. **Package → line create / renew (`resolveLineCreateFromPackage`)** — wrong days/cost/bouquets = silent billing bugs.  
8. **Live playback URL export (`export-playback-url` / media origin)** — CF vs LB IP; apps ignore 302.  
9. **nginx/panel `/live` must 502 (not 302) when media refused** — routing lock regressions.  
10. **MAG/Stalker portal (`/c/`, create_link)** — black screens / auth failures are high support load.  
11. **xmltv.php export** — invalid XML / wrong timezone breaks EPG clients.  
12. **Staff permission bypass** — STAFF with partial grants hitting admin APIs.  
13. **FFmpeg command construction from stream source URLs** — command injection.  
14. **SSRF on provider pull / artwork / EPG URL fetch** — some `ssrf.test.ts` exists; extend to all fetch sites.  
15. **Panel update / prebuilt tarball apply** — can brick customer panels.  
16. **XUI / SQL migration import** — data loss / partial import.  
17. **Same-IP / fingerprint / apps-lock enforcement** — false ban or bypass.  
18. **Load-balancer server selection when all nodes unhealthy** — total outage behavior.  
19. **JWT session fixation / role claim tampering / cookie secure flags** — auth bypass.  
20. **Shop/billing + access codes** — unpaid provisioning or double redeem.

---

## 8. Recommended execution order (aligned to your Cursor prompts)

| Phase | Prompt # | Nexlify-specific adaptation |
|-------|----------|------------------------------|
| **Done** | 1 Recon | This file |
| Next | 2 Harness | Keep **`tsx --test`**; add test DB URL, factories, **c8** coverage thresholds, scripts `test:unit` / `test:integration`; **do not** blindly install Jest |
| | 3 Unit folders | Start `@Folder src/lib/` highest-risk files lacking tests; then `src/app/player_api.php/` helpers |
| | 4 Integration + Xtream | Priority #1 deliverable after harness |
| | 5 Security | Fail-then-fix with regression tests |
| | 6 DB/business | Credits, expiry, cascades |
| | 7 Stream/infra | Mock FFmpeg; edge parity |
| | 8 Playwright | Admin + reseller happy/negative paths |
| | 9 Load | k6 in `tests/load/` against staging **not** prod 45; see `tests/load/README.md` |
| | 10 CI | GitHub Actions + Postgres/Redis services |
| | 11 Sweep | `COVERAGE-REPORT.md` |

**Also add:** `.cursor/rules/testing.mdc` (your bonus) before Phase 2 so generations stay disciplined.

---

## 9. Explicit non-goals for Phase 1

- No new test files  
- No dependency installs  
- No source refactors  
- No commit (ask operator before committing this plan)

---

## 10. Immediate next prompt (Phase 2)

When ready, run **only**:

> Set up test infrastructure for this Next.js + Prisma + Postgres + Redis panel using the **existing `tsx --test` runner** (do not migrate to Jest unless necessary). Add isolated test DATABASE_URL, Redis mock/testcontainer, factories for admin/reseller/sub-reseller/line/bouquet/stream/EPG/MAG, c8 coverage thresholds (70% lines / 60% branches on scoped packages), npm scripts `test`, `test:unit`, `test:integration`, `test:watch`, `test:coverage`, and one passing smoke test. Mock FFmpeg/HTTP/SMTP by default. Show config + smoke test only.

---

*End of Phase 1 recon.*
