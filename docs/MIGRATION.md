# Panel migration

Admin → **Import** → **Panel migration** (`/admin/import/migrate`).

## Supported sources

| Panel | Input | Notes |
|-------|--------|--------|
| **1-stream** | **PostgreSQL live** (recommended) | Read-only connection; auto-detects `subscriptions`, `packages`, `streams`, junction tables, MAG |
| **1-stream** | `.sql` / JSON | Fallback if DB is not reachable from Nexlify |
| **XUI.one** | MySQL `.sql` backup | `lines`, `streams`, `bouquets`, `mag_devices` |
| **Xtream UI** | `.sql` | Often uses `users` for lines |
| **Midnight Streamers** | `.sql` or JSON | `channels` / `subscribers` aliases |
| **Nexlify JSON** | `.json` | Universal interchange format |

## 1-stream PostgreSQL (live)

1. On the 1-stream server, create a **read-only** Postgres user (optional but recommended).
2. Allow Nexlify VPS IP to connect to port `5432` (firewall / `pg_hba.conf`).
3. In migration UI, choose **1-stream** → **PostgreSQL (live)**.
4. Click **Test connection & detect tables** — confirms mapped tables and row counts.
5. **Preview**, then **Run import**.

**Phase 2** (1-stream PostgreSQL only): also import **categories**, **stream servers**, and **EPG sources** when those tables are detected.

Auto-mapping looks for table names such as:

- Lines: `subscriptions`, `lines`, `clients`, `subscribers`
- Packages/bouquets: `packages`, `bouquets`, `bundles`
- Streams: `streams`, `media_streams`, `live_streams`, `channels`
- Junction: `package_streams`, `bouquet_streams`, `subscription_packages`
- MAG: `mag_devices`, `stb_devices`

Override schema with the **Schema** field if the panel uses a non-`public` schema.

Credentials are **not stored** — only used for the migration request.

## File-based workflow (other panels)

1. Full MySQL/Postgres dump from the old panel.
2. Upload or paste → **Preview** → **Run import**.

## Nexlify JSON example

```json
{
  "source": "nexlify_json",
  "bouquets": [{ "legacyId": "1", "name": "Full", "streamLegacyIds": ["10", "11"] }],
  "streams": [{ "legacyId": "10", "name": "CNN", "streamUrl": "http://...", "type": "LIVE" }],
  "lines": [{ "username": "user1", "password": "pass1", "expiresAt": "2026-12-31T00:00:00Z", "bouquetLegacyIds": ["1"] }]
}
```

## After migration

- Assign **stream servers** and probe streams.
- Re-link **EPG** and categories.
- Rotate line passwords if importing production plaintext passwords.

## Why Nexlify vs legacy panels

- Same **PostgreSQL** stack as 1-stream (no MySQL conversion for 1-stream migrations).
- **Live schema discovery** instead of manual table guessing.
- **Fast playback** path, stream agent v2, IP lock, billing webhooks — see the advantages block on the migration page.
