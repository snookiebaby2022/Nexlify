# Panel migration

Admin → **Import** → **Panel migration** (`/admin/import/migrate`).

## Supported sources

| Panel | Input | Notes |
|-------|--------|--------|
| **1-stream** | **PostgreSQL live** (recommended) | Read-only connection; auto-detects `subscriptions`, `packages`, `streams`, junction tables, MAG |
| **1-stream** | `.sql` / JSON | Fallback if DB is not reachable from Nexlify |
| **XUI.one** | MySQL `.sql` backup | Full dump preferred; nested bouquet JSON + junction tables supported |
| **Xtream UI** | `.sql` | Often uses `users` for lines |
| **Midnight Streamers** | `.sql` or JSON | `channels` / `subscribers` aliases |
| **Nexlify JSON** | `.json` | Universal interchange format |

## What gets imported

| Entity | Notes |
|--------|--------|
| Lines / subscriptions | Expiry, max cons, bouquets, IP lock, countries, trial/restreamer, UA lists, forced server |
| Streams | URL + backup URL, type, category, EPG/channel ids, adult/radio, series/season/episode, server |
| Bouquets | Channel lists — flattens XUI `{"live":[…],"vod":[…]}` and SQL junction tables |
| Resellers | Credits, email, DNS, max lines, parent tree |
| MAG / Enigma | Linked by username or line id |
| Categories | Type, parent, adult, sort order |
| Stream servers | Host/port/protocol, domain, capacity, private IP |
| EPG sources | URL + country |
| Packages | Duration/credit billing packages (when source has days/credits) |

## XUI.one SQL — correct workflow

1. On the XUI server, export a **full MySQL dump** (phpMyAdmin → Export → **Complete inserts** / mysqldump with column names).
2. Prefer dumps **with column names**. Headerless `INSERT INTO t VALUES (...)` is auto-inferred, but named columns are more reliable.
3. In Nexlify: **Import → Panel migration** → source **XUI.one** → upload the `.sql`.
4. Click **Preview** — check mapped counts for lines/streams/bouquets. Warnings explain unmapped tables.
5. Optionally enable **Clear existing IPTV data** on a clean cutover, then **Run import**.
6. After import: assign/probe stream servers, re-check EPG, rotate passwords if needed.

### XUI quirks handled

- Nested bouquet channels: `{"live":[1,2],"movie":[3],"series":[4]}`
- `stream_source` JSON arrays → primary + backup URL
- Junction tables: `bouquet_streams`, `package_streams`, `users_bouquets`, etc.
- Headerless INSERT inference (content + XUI column-order templates)

## 1-stream PostgreSQL (live)

1. Create a **read-only** Postgres user (optional).
2. Allow Nexlify VPS IP on port `5432`.
3. Choose **1-stream** → **PostgreSQL (live)** → **Test connection & detect tables**.
4. **Preview**, then **Run import**.

Live PG also merges `package_streams` / `subscription_packages` junction tables. SQL dumps for 1-stream now get the same junction merge.

## File size limits

- Paste/preview: ~512 KB
- Upload multipart: up to **2 GB**

## After migration

- Assign **stream servers** and probe streams.
- Re-link **EPG** where channel ids differ.
- Rotate line passwords if importing production plaintext passwords.
- Review reseller tree and packages under Admin.

## Still configure on Nexlify (not in legacy dumps)

Stream agents, blocklists, WHMCS, TMDB, CDN/RTMP edges, tickets, and most ops tooling are Nexlify-native — set those up after the data cutover.
