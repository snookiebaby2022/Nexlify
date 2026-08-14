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
| Lines / subscriptions | Username + **plaintext password**, expiry, max cons, bouquets, IP lock, countries, trial/restreamer, UA lists, forced server |
| Streams | **All** stream rows kept (empty sources filled from `streams_servers.current_source`, else `pending://` placeholder). URLs with credentials kept as-is. Default import: **on-demand** for live/movies/series. Sorted by source `order`. |
| Bouquets | Channel lists — flattens XUI `{"live":[…],"vod":[…]}` and SQL junction tables |
| Resellers | Username + password (hashed on import so the same password still works), credits, email, DNS, max lines, parent tree |
| MAG / Enigma | Linked by username or line id |
| Categories | Type, parent, adult, sort order |
| Stream servers | Host/port/protocol, `domain_name`, HTTP/HTTPS/RTMP broadcast ports, capacity, private IP — **SSH passwords are not in SQL dumps** (re-enter on Nexlify) |
| EPG sources | Full source URL + country (re-sync programmes after import unless Full EPG guide is enabled) |
| Packages | Duration/credit billing packages (when source has days/credits) |
| Providers | Host/IP + port + SSL → `baseUrl`; **username:password** stored as provider `apiKey` for live upstream |
| Watch folders | `watch_folders` + capped watch/import logs → WatchFolder / ImportJob |
| Tickets | `tickets` (+ replies) → Ticket / TicketMessage (classic XC / XUI / StreamCreed) |
| Full EPG guide | Default on: `epg_channels` catalog + capped `epg_data` programmes (uncheck for source URLs only) |
| ASN blocks | `blocked_asns` → BlockedAsn (when the source has ASN tables) |
| Logs / stats | Capped panel/line/user/stream/client logs → ActivityLog; server stats/activity → BandwidthSnapshot |
| Settings | Stored as PanelSetting `migration.<source>_settings` for review (not applied blindly) |

Credentials and playable URLs in the dump are **preserved** on import (nothing is stripped or redacted in the migrator). Admin UI may still hide sensitive fields from lower roles after import.

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
- `stream_source` JSON/PHP arrays → **all** URLs kept (primary + backup + extras); credentials in URLs unchanged
- Correct stream `type` map: 1 live, 2 movie, 3 created, 4 radio, 5 series
- JSON `category_id` arrays (e.g. `"[12]"`)
- Modern XUI.one tables: `lines` + `users` (resellers), `streams_servers`, `streams_series`, `streams_episodes`, `streams_categories`, `users_packages`
- Extended tables (all MySQL lineage sources + 1-stream PG when present): `providers` / `streams_providers`, `providers_streams`, `watch_folders`, `watch_logs`, `tickets`, `epg_channels`, `epg_data`, `blocked_asns`, panel/line/user/client/stream logs, `servers_stats` / `server_activity`, `settings`
- `streams_servers` / `streams_sys` → stream server assignment
- Series episodes enrich existing `streams` rows (or create rows when episode has its own URL)
- Resellers from `reg_users` (classic) or `users` (modern, when `lines` exists)
- Junction tables: `bouquet_streams`, `package_streams`, `users_bouquets`, etc.
- Headerless INSERT inference via CREATE TABLE DDL + column-order templates
- Servers: `domain_name`, `http_broadcast_port` / `https_broadcast_port`, `rtmp_port`

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

- Streams are imported **on-demand** by default (start when a client plays them). Uncheck “Import all streams as on-demand” only if you want always-running live agents.
- Streams are **active** by default; optionally import as stopped to verify URLs first.
- Transcoder / encode profiles may be incomplete — rebuild on Nexlify.
- Re-enter **server SSH passwords** (not present in MySQL dumps; Nexlify does not store them from SQL).
- Assign / probe stream servers; re-link **EPG** where channel ids differ (or enable **Full EPG guide** to import `epg_channels` / capped `epg_data`).
- Review imported providers, watch folders, tickets, ASN blocks, and `migration.<source>_settings` under Admin.
- After cutover, **stop legacy XC / panel processes** on old servers.
- Line and provider passwords/URLs arrive **as in the dump** — optionally rotate line passwords after cutover if you do not want production plaintext retained.
- Review reseller tree and packages under Admin.

## Still configure on Nexlify (not in legacy dumps)

Stream agents, blocklists, WHMCS, TMDB, CDN/RTMP edges, and most ops tooling are Nexlify-native — set those up after the data cutover.
