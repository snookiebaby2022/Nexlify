# TESTPLAN blockers (Xtream integration)

Functions / paths that could not be exercised through the real Next.js route
handlers without either modifying production source or hitting a live DB.

## Blockers

### 1. `src/app/player_api.php/route.ts` — full HTTP handler under mock
**Why untestable without refactor:** Handler closes over `getLineByCredentials`,
`cacheGetOrSet`, Redis catalog blobs (`serveXtreamCatalogJson`), and
`assertPlaybackAllowed`. Node `mock.module` works for bare file URLs but does
not cleanly intercept `@/` alias imports under `tsx` without an ESM loader
hook. No `TEST_DATABASE_URL` is configured locally.

**Suggested refactor:** Extract `handlePlayerApiInner` (already private) to
`src/lib/xtream-player-api.ts` with injectable deps:
`{ getLine, assertGuard, catalog, cache, now }`. Route becomes a thin adapter.
Then integration tests inject the in-memory harness.

### 2. `assertPlaybackAllowed` never returns `"connections"`
**Why:** `lineHasConnectionCapacity` is imported in `playback-guard.ts` but
never called. Live capacity is enforced in
`src/app/api/internal/live-auth/route.ts` (edge auth), not in
`/live/...` hotPath (which skips capacity) or player_api listing.

**Suggested refactor:** Call `lineHasConnectionCapacity` from
`assertPlaybackAllowedInner` when `!options?.listingOnly && !options?.hotPath`
(or always for non-listing). Align `/live` route with live-auth so panel
direct playback and edge agree.

### 3. `xtreamUserInfo` always sets `is_trial: "0"`
**Why:** Trial lines cannot be asserted via the `is_trial` field; only
`expiresAt` / `lineIsPlayable` govern expiry. Boundary-second behaviour is
covered via `effectiveLineStatus` (`expiresAt < now`, equal second still
Active).

**Suggested refactor:** Persist `isTrial` on `Line` (or derive from package)
and set `user_info.is_trial` to `"1"` | `"0"` accordingly.

### 4. `buildM3uStream` / `buildLineXmltv` — real I/O
**Why:** Both pull settings + Prisma (and gzip filesystem for xmltv). Cannot
run without DB/fs.

**Suggested refactor:** Accept `streams: StreamForLine[]` / `channels + programmes`
as optional injected inputs; default to current DB path.

### 5. RFC5737 / test IPs bypass max_connections
**Why:** `isTestConnectionIp` short-circuits capacity. Integration tests must
use non-test IPs (e.g. `10.0.0.x`) when asserting N+1 refuse.

No source change required — documented for future route-level tests.

---

# Data-layer blockers

### 6. Prisma migrations have no DOWN scripts
**Why:** `prisma/migrations/*/migration.sql` is forward-only. There is no
`down.sql` / `migrate down`. Closest path is `prisma migrate reset` then
`migrate deploy` on a disposable DB.

**Tests:** `tests/data-layer/migrations.test.ts` asserts inventory + optional
`migrate deploy` when `TEST_DATABASE_URL` is set.

### 7. Line DELETE does not refund credits
**Why:** `DELETE /api/admin/lines/[id]` deletes and logs only — no credit
ledger refund. `group-config.refundIneligiblePercent` is unused on delete.

**Suggested refactor:** Optional refund of remaining package value inside the
same transaction, gated by refund policy.

### 8. Sub-reseller “credit inheritance”
**Why:** Subs have their own `credits` balance. Bouquet access inherits from
the parent; credits do not auto-transfer (admin credits API only).

---

# Streaming-component blockers

### 9. `executeFailover` / `syncEpgSource` / `resolvePlaybackLoadBalancerId`
**Why:** Need Prisma + settings/cache (and HTTP for EPG fetch). Not injectable
without production changes. Covered instead by pure helpers:
`rankSourceCandidates`, `applySourceProbe`, `preferHeadroomPool`,
`shouldKeepStickyLineLb`, `parseXmltvPrograms` / gzip decode in-process.

**Suggested refactor:** Accept deps `{ getSettings, cache, findStream, testUrl }`
and `{ fetchXml, writePrograms }` for unit tests.

### 10. Packager ffmpeg argv (`delete_segments` / `hls_list_size`)
**Why:** Spawn args are built inside a non-exported session starter in
`ts-hls-packager.ts`. Tests assert playlist-side cleanup via
`filterPackagerPlaylistToExisting` and live input prefix.

**Suggested refactor:** Export `buildPackagerFfmpegArgv(opts)` mirroring
`buildFfmpegArgv`.

### 11. `evaluateProbeOutcome` / `resolveDisplayStatus`
**Why:** Not exported from `panel-monitoring-jobs.ts` /
`stream-live-stats.ts`. Online/offline/timeout covered via
`classifyProbeFailure` + `decideProbePersist`; restarting via circuit
`half_open` recovery.

---

# Playwright E2E blockers

### 12. E2E requires local Postgres `nexlify_test`
**Why:** Specs skip when `.env.test` / `TEST_DATABASE_URL` is missing.
`npm run test:db:prepare` must succeed before `npm run test:e2e`.

### 13. Stream / line create forms are XUI-dense
**Why:** Multi-tab forms (Sources/Details, package/bouquets) are brittle
under strict role selectors. Specs use label/placeholder + list
verification; if a tab label changes, update `admin.spec.ts` /
`reseller.spec.ts`.

### 14. Playwright Chromium download may fail offline
**Why:** `npx playwright install chromium` timed out in some networks.
Config defaults `PW_CHANNEL=msedge` on Windows (system Edge). Override with
`PW_CHANNEL=chrome` or install Chromium via `npm run test:e2e:install`.

---

# Load-test (k6) blockers

### 15. k6 must be installed separately
**Why:** Not an npm dependency (Go binary). `npm run test:load` exits 2 if
`k6` is missing. Install via winget/brew/apt — see `tests/load/README.md`.
Prisma credit race (`npm run test:load:credit-race`) does not need k6.

### 16. Full 10k-channel seed + 5k VUs need staging hardware
**Why:** Seeding 10k `Stream` + `BouquetStream` rows and holding 5000 k6 VUs
exceeds typical laptop Postgres/Next. Use `LOAD_CHANNEL_COUNT=1000`,
`LOAD_AUTH_VUS=100`, `LOAD_LIVE_AUTH_VUS=200` for smoke; full thresholds
against dedicated staging (never prod 45).

### 17. `pg_stat_statements` often disabled locally
**Why:** Extension requires `shared_preload_libraries`. Without it,
`test:load:slow-queries` still writes EXPLAIN samples; curated top-10 lives
in `tests/load/SLOW-QUERIES.md`.

### 18. Admin API rate limit can mask HTTP credit race
**Why:** `enforceAdminApiRateLimit` keys on client IP. k6 spreads
`X-Forwarded-For`; definitive no-double-spend proof is
`test:load:credit-race` (direct `debitResellerCredits`).

---

# CI blockers

### 19. `npm audit --audit-level=high` may fail on existing advisories
**Why:** CI job `audit` fails the build on high/critical npm advisories.
Remediate with `npm audit fix` / dependency bumps; do not weaken the gate
without an explicit exception list.

### 20. Full `tsc --noEmit` may surface pre-existing type errors
**Why:** `npm run typecheck` is new in CI. If the job fails on legacy errors,
triage or narrow `tsconfig` excludes — do not delete the gate.
