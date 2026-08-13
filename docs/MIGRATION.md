# Panel migration

Admin → **Import** → **Panel migration** (`/admin/import/migrate`).

Paths below are mapped from the official **1-stream Migration Guide (Experimental)** for use on **Nexlify**. Use this UI — do **not** run `php artisan migrate-system:from …` on the Nexlify host.

## Correct paths (default DB names)

| Source panel | Default DB (guide) | Nexlify source | Input |
|--------------|--------------------|----------------|--------|
| **StreamCreed** | `streamcreed_db` | StreamCreed | MySQL `.sql` |
| **XUI.one** | `xui` (also `xuione` / `xuoione`) | XUI.one | MySQL `.sql` — use `scripts/xui-export-backup.sh` |
| **Xtream Codes** | `xtream_iptvpro` | Xtream Codes / Xtream UI | MySQL `.sql` |
| **NXT-DASH** | `nxt` | NXT-DASH | MySQL `.sql` |
| **1-stream** (into Nexlify) | (your PG DB) | 1-stream | **PostgreSQL live** (recommended) or `.sql` / JSON |
| **Midnight Streamers** | — | Midnight Streamers | `.sql` / JSON |
| **Nexlify JSON** | — | Nexlify JSON | `.json` |

### Guide → Nexlify mapping notes

- 1-stream’s artisan migrators target **1-stream**. Nexlify’s importer targets **Nexlify** with the same dump / DB-access ideas.
- The guide routes **Xtream Codes** through the StreamCreed migrator with DB `xtream_iptvpro`. On Nexlify, choose **Xtream Codes / Xtream UI** and use that dump/DB name.
- If the source DB is not reachable from the Nexlify VPS, use an **SSH tunnel** and point the migrator (or dump tools) at localhost through the tunnel.

## What gets imported

| Entity | Notes |
|--------|--------|
| Lines / subscriptions | Expiry, max cons, bouquets, IP lock, countries, trial/restreamer, UA lists, forced server |
| Streams | URL + backup URL, type, category, EPG/channel ids, adult/radio, series/season/episode, server — **imported stopped by default** (guide parity) |
| Bouquets | Channel lists — flattens XUI `{"live":[…],"vod":[…]}` and SQL junction tables |
| Resellers | Credits, email, DNS, max lines, parent tree |
| MAG / Enigma | Linked by username or line id |
| Categories | Type, parent, adult, sort order |
| Stream servers | Host/port/protocol, domain, capacity, private IP — **SSH passwords are not migrated** |
| EPG sources | URL + country (source URLs only — re-sync programmes after import) |
| Packages | Duration/credit billing packages (when source has days/credits) |
| Providers | `providers` / `streams_providers` / `providers_streams` → StreamProvider + stream links (XUI, StreamCreed, Xtream UI, NXT, 1-stream when present) |
| Watch folders | `watch_folders` + capped watch/import logs → WatchFolder / ImportJob |
| Tickets | `tickets` (+ replies) → Ticket / TicketMessage (classic XC / XUI / StreamCreed) |
| Full EPG guide | Opt-in: `epg_channels` catalog + capped `epg_data` programmes (all MySQL lineage panels + 1-stream) |
| ASN blocks | `blocked_asns` → BlockedAsn (when the source has ASN tables) |
| Logs / stats | Capped panel/line/user/stream/client logs → ActivityLog; server stats/activity → BandwidthSnapshot |
| Settings | Stored as PanelSetting `migration.<source>_settings` for review (not applied blindly) |

## StreamCreed / XUI.one / Xtream Codes / NXT — SQL workflow

### Correct XUI.one dump (on the XUI host)

XUI’s built-in backup cron dumps MySQL; for Nexlify you need a **full** dump with **column names**:

```bash
# Default XUI.one DB name is usually `xui` (confirm with: mysql -e 'SHOW DATABASES;')
mysqldump -u root -p --single-transaction --complete-insert xui > xui-backup.sql

# Or copy scripts/xui-export-backup.sh onto the XUI host and run it
bash xui-export-backup.sh xui /root/xui-backup.sql
```

Avoid: table-only exports, phpMyAdmin “quick” dumps without Complete inserts, or restoring into Nexlify via `mysql` (use the Panel migration UI).

1. On the source host, export a **full MySQL dump** of the default DB name above (phpMyAdmin → Export → **Complete inserts**, or `mysqldump` with `--complete-insert`).
2. Prefer dumps **with column names** and `CREATE TABLE` DDL (standard mysqldump). Headerless `INSERT INTO t VALUES (...)` is auto-inferred from CREATE TABLE / content, but named columns are more reliable.
3. In Nexlify: **Import → Panel migration** → select the matching source → upload the `.sql`.
4. Click **Preview** — check mapped counts. Warnings explain unmapped tables.
5. Leave **Import streams as stopped** enabled unless you intentionally want live streams immediately.
6. Optionally enable **Clear existing IPTV data** on a clean cutover, then **Run import**.

### XUI / XC quirks handled

- Nested bouquet channels: `{"live":[1,2],"movie":[3],"series":[4]}`
- `stream_source` JSON arrays → primary + backup URL
- Correct stream `type` map: 1 live, 2 movie, 3 created, 4 radio, 5 series
- JSON `category_id` arrays (e.g. `"[12]"`)
- Modern XUI.one tables: `lines` + `users` (resellers), `streams_servers`, `streams_series`, `streams_episodes`, `streams_categories`, `users_packages`
- Extended tables (all MySQL lineage sources + 1-stream PG when present): `providers` / `streams_providers`, `providers_streams`, `watch_folders`, `watch_logs`, `tickets`, `epg_channels`, `epg_data`, `blocked_asns`, panel/line/user/client/stream logs, `servers_stats` / `server_activity`, `settings`
- `streams_servers` / `streams_sys` → stream server assignment
- Series episodes enrich existing `streams` rows (or create rows when episode has its own URL)
- Resellers from `reg_users` (classic) or `users` (modern, when `lines` exists)
- Junction tables: `bouquet_streams`, `package_streams`, `users_bouquets`, etc.
- Headerless INSERT inference via CREATE TABLE DDL + column-order templates

## 1-stream PostgreSQL (live) → Nexlify

1. Create a **read-only** Postgres user (optional).
2. Allow Nexlify VPS IP on port `5432`, or open an SSH tunnel.
3. Choose **1-stream** → **PostgreSQL (live)** → **Test connection & detect tables**.
4. **Preview**, then **Run import**.

Live PG also merges `package_streams` / `subscription_packages` junction tables. SQL dumps for 1-stream get the same junction merge.

## File size limits

- Paste/preview: ~512 KB
- Upload multipart: up to **2 GB**

## After migration (guide checklist)

- Streams are **stopped** by default — verify URLs, then enable.
- Transcoder / encode profiles may be incomplete — rebuild on Nexlify.
- Re-enter **server SSH passwords** (not present in dumps).
- Assign / probe stream servers; re-link **EPG** where channel ids differ (or enable **Full EPG guide** to import `epg_channels` / capped `epg_data`).
- Review imported providers, watch folders, tickets, ASN blocks, and `migration.<source>_settings` under Admin.
- After cutover, **stop legacy XC / panel processes** on old servers.
- Rotate line passwords if importing production plaintext passwords.
- Review reseller tree and packages under Admin.

## Still configure on Nexlify (not in legacy dumps)

Stream agents, blocklists, WHMCS, TMDB, CDN/RTMP edges, and most ops tooling are Nexlify-native — set those up after the data cutover.
