# Top 10 slowest DB queries (load / IPTV hot path)

Profiled from code paths exercised by the k6 scenarios (`player_api` auth,
`live-auth`, `get.php` M3U for 10k channels, credit debit) plus existing
indexes in `prisma/schema.prisma`. After a real load run against staging,
refresh numbers with:

```bash
npm run test:load:slow-queries
# requires: CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

Live capture lands in `tests/load/reports/db-slow-queries.json`. This file is
the curated top-10 with **suggested indexes** (several already exist).

| # | Query / path | Why slow under load | Suggested index / fix |
|---|--------------|---------------------|------------------------|
| 1 | Lean M3U listing join: `BouquetStream` DISTINCT → `Stream` → `Category` (`forEachLeanListingBatch` / `loadLeanListingForLine`) | 10k+ rows; DISTINCT subquery + sort on `sortOrder,name,id` | **Have:** `BouquetStream(bouquetId,sortOrder)`, `Stream(type,isActive,sortOrder,name,id)`. **Add if missing:** covering `(bouquetId, streamId)` already PK. Consider `INCLUDE` style partial: no Prisma equivalent — keep batching. |
| 2 | `SELECT DISTINCT streamId FROM BouquetStream WHERE bouquetId IN (...)` (`bouquetMembershipSql`) | Multi-bouquet lines explode DISTINCT | Prefer single-bouquet lines for large catalogs; ensure only active bouquets in `IN` list. Index: `@@index([bouquetId, sortOrder])` **exists**. |
| 3 | `Line` credential lookup with `findFirst` case-insensitive fallback (`getLineByCredentials`) | Unique index on `username` helps exact match; insensitive path may seq-scan | Prefer exact `findUnique`; if legacy mixed-case remains, add expression index: `CREATE INDEX CONCURRENTLY "Line_username_lower_idx" ON "Line" (lower(username));` |
| 4 | `Line` + `LineBouquet` + `Bouquet` include on every auth (`lineAuthInclude`) | Extra joins on every `player_api` / live-auth | Cache (already 45s via `cacheGetOrSet`). Optional denorm: store `bouquetIds` JSON on `Line` for auth-only path. |
| 5 | Live-auth stream resolve: `Stream.findFirst` by id / `xtreamNum` + server scope | Hot under 5k concurrent auth | **Have:** `Stream(xtreamNum)`, PK on `id`, `Stream(serverId,type,isActive)`. Ensure agents pass cuid not numeric when possible. |
| 6 | Playback URL candidate resolve + cache miss (`resolvePlaybackUrlCandidatesForLine`) | Nested settings/server lookups | Redis cache keys already used; keep TTL warm. Index `Stream(serverId)` **exists**. |
| 7 | `LiveConnection` capacity / lastSeen sweeps (`lineHasConnectionCapacity`) | Under real IPs, range scans on `lastSeenAt` | **Have:** `(lastSeenAt)`, `(lastSeenAt,lineId)`, `(lineId)`. Load tests use RFC5737 IPs to skip — staging with real IPs should monitor this. |
| 8 | Credit debit: `PanelUser.updateMany WHERE id AND credits >= $n` + ledger insert | Contended row under concurrent creates | Correctness > speed (atomic). Optional: advisory lock not needed. Index: PK on `PanelUser.id` sufficient. `CreditTransaction(userId,createdAt)` **exists**. |
| 9 | `EpgProgramme` by `channelId,start` for XMLTV (adjacent to playlist warm) | Large EPG windows | **Have:** `(channelId, start)`. Partition by time if programmes > 10M. |
| 10 | Admin/reseller line list / activity log filters under panel UI during test | `ActivityLog` / `Line(ownerId,createdAt)` | **Have:** `Line(ownerId)`, `ActivityLog(userId,createdAt)`. Avoid `ILIKE '%x%'` on username without `pg_trgm` GIN. |

## Enable pg_stat_statements (staging only)

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- postgresql.conf: shared_preload_libraries = 'pg_stat_statements'
```

Then reset stats before a run: `SELECT pg_stat_statements_reset();`

## Pass criteria (from request)

| Scenario | Target |
|----------|--------|
| 1000 concurrent `player_api.php` auth | **p95 < 300ms**, error rate < 5% |
| 5000 simultaneous live-auth | report p50/p95/p99 + error rate |
| M3U for 10k channels | EXTINF ≥ 90% of seeded count; report duration |
| Concurrent credit deductions | successes = starting credits; balance never < 0 |

Reports: `tests/load/reports/LOAD-REPORT.md` after `npm run test:load`.
