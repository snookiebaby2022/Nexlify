/**
 * Migration paths adapted from the official 1-stream Migration Guide (Experimental).
 *
 * That guide migrates *into* 1-stream via `php artisan migrate-system:from …`.
 * Nexlify uses Admin → Import → Panel migration instead — same dump / DB access
 * ideas, different target and importer.
 */

import type { MigrationSource } from "./types";

export type MigrationGuidePath = {
  /** Nexlify panel-migration source id */
  id: MigrationSource;
  label: string;
  /** Default database name from the 1-stream guide (when known) */
  defaultDatabase?: string;
  engine: "mysql" | "postgres" | "json";
  /** Equivalent 1-stream artisan flag (documentation only — do not run on Nexlify) */
  oneStreamArtisan?: string;
  /** Short hint under the source dropdown */
  hint: string;
  /** Ordered steps for this source on Nexlify */
  steps: string[];
  /** Post-import checklist (guide + Nexlify cutover) */
  postImport: string[];
  notes: string[];
};

const SHARED_POST_IMPORT = [
  "Review imported streams — they import as on-demand by default (start when played). Optionally import as stopped if you want to verify URLs first.",
  "Transcoder / encode profiles may be incomplete after import; re-check and rebuild profiles on Nexlify.",
  "Server SSH passwords are not in SQL dumps — re-enter them on each stream server in Nexlify.",
  "Assign / probe stream servers and re-link EPG where channel ids differ.",
  "After cutover, stop legacy XC / panel processes on the old servers so clients do not keep hitting them.",
  "Line passwords, stream URLs (with embedded credentials), provider user/pass, and EPG URLs are imported from the dump as-is — optionally rotate line passwords after cutover.",
  "Any pending:// streams had no URL in the dump — fix those source URLs under Streams before go-live.",
];

const TUNNEL_TIP =
  "If MySQL/Postgres is not reachable from the Nexlify VPS, open an SSH tunnel from the panel host (or a jump host) and point the migrator at localhost through that tunnel.";

/**
 * Canonical paths for panels covered by the 1-stream Migration Guide,
 * plus Nexlify-native sources (1-stream PG live, Midnight, JSON).
 */
export const MIGRATION_GUIDE_PATHS: MigrationGuidePath[] = [
  {
    id: "streamcreed",
    label: "StreamCreed",
    defaultDatabase: "streamcreed_db",
    engine: "mysql",
    oneStreamArtisan: "migrate-system:from streamcreed",
    hint: "MySQL dump — default DB name streamcreed_db (1-stream Migration Guide).",
    steps: [
      "On the StreamCreed host, export a full MySQL dump of streamcreed_db (mysqldump or phpMyAdmin → Complete inserts).",
      TUNNEL_TIP,
      "In Nexlify: Admin → Import → Panel migration → source StreamCreed → upload the .sql.",
      "Preview mapped counts (lines, streams, bouquets, packages, tickets, EPG, logs when present), then Run import.",
    ],
    postImport: SHARED_POST_IMPORT,
    notes: [
      "1-stream uses artisan migrate-system:from streamcreed against streamcreed_db; Nexlify maps the same dump through the StreamCreed / XUI-lineage SQL importer, including extended tables when present.",
    ],
  },
  {
    id: "xui",
    label: "XUI.one",
    defaultDatabase: "xui",
    engine: "mysql",
    oneStreamArtisan: "migrate-system:from xuione",
    hint: "MySQL dump — default DB name xui (also xuione / xuoione). Use scripts/xui-export-backup.sh on the XUI host.",
    steps: [
      "On the XUI.one host, run: mysqldump -u root --complete-insert --single-transaction xui > xui-backup.sql (or bash scripts/xui-export-backup.sh). Confirm DB name with SHOW DATABASES — often xui, sometimes xuione/xuoione.",
      TUNNEL_TIP,
      "In Nexlify: Admin → Import → Panel migration → source XUI.one → upload the .sql.",
      "Preview — check lines, streams, bouquets, MAG, resellers, categories, servers, packages, providers, tickets, EPG.",
      "Optionally enable Clear existing IPTV data for a clean cutover, then Run import.",
    ],
    postImport: SHARED_POST_IMPORT,
    notes: [
      "Nested bouquet JSON or plain ID arrays, streams_sys/streams_servers links, series episodes, providers (ip/port/ssl + user:pass), all stream_source URLs with credentials, server domain_name/broadcast ports, watch folders, tickets, EPG, packages with month/hour duration units, MAG (mag_id), and junction tables are mapped when present.",
      "Do not use a partial/table-only dump — export the full database.",
    ],
  },
  {
    id: "xtream_ui",
    label: "Xtream Codes / Xtream UI",
    defaultDatabase: "xtream_iptvpro",
    engine: "mysql",
    oneStreamArtisan: "migrate-system:from streamcreed (with DB xtream_iptvpro)",
    hint: "MySQL dump — default DB name xtream_iptvpro. Guide: use StreamCreed-style migrator; Nexlify uses Xtream UI source.",
    steps: [
      "Export a full MySQL dump of xtream_iptvpro from the Xtream Codes / Xtream UI host.",
      TUNNEL_TIP,
      "In Nexlify: choose Xtream Codes / Xtream UI (not a separate StreamCreed artisan run).",
      "Upload the .sql → Preview → Run import (tickets, epg_data, settings, logs map when present; streams_providers if installed).",
    ],
    postImport: SHARED_POST_IMPORT,
    notes: [
      "The 1-stream guide routes Xtream Codes through the StreamCreed migrator with database name xtream_iptvpro. On Nexlify, select this source and use that same dump/DB name.",
      "Classic XC has tickets/epg_data/settings/logs; providers/watch/ASN only if the fork added those tables.",
    ],
  },
  {
    id: "nxt",
    label: "NXT-DASH",
    defaultDatabase: "nxt",
    engine: "mysql",
    oneStreamArtisan: "migrate-system:from nxt",
    hint: "MySQL dump — default DB name nxt (1-stream Migration Guide).",
    steps: [
      "Export a full MySQL dump of the nxt database from the NXT-DASH host.",
      TUNNEL_TIP,
      "In Nexlify: Admin → Import → Panel migration → source NXT-DASH → upload the .sql.",
      "Preview carefully — NXT schemas vary; review warnings for unmapped tables before importing.",
    ],
    postImport: SHARED_POST_IMPORT,
    notes: [
      "Best-effort XUI-lineage table mapping including extended entities when table names match. If Preview counts look wrong, export Nexlify JSON or adjust the dump and re-run.",
    ],
  },
  {
    id: "onestream",
    label: "1-stream",
    defaultDatabase: undefined,
    engine: "postgres",
    hint: "Live PostgreSQL (recommended) or SQL/JSON export from a 1-stream panel into Nexlify.",
    steps: [
      "Prefer a read-only Postgres role on the source 1-stream database.",
      "Allow the Nexlify VPS IP on port 5432, or use an SSH tunnel and connect via localhost.",
      "In Nexlify: source 1-stream → PostgreSQL (live) → Test connection & detect tables → Preview → Run import.",
      "If the DB is unreachable, fall back to a PostgreSQL .sql dump or JSON export (SQL / JSON file mode).",
    ],
    postImport: SHARED_POST_IMPORT,
    notes: [
      "This path migrates *out of* 1-stream into Nexlify. Do not run php artisan migrate-system on the Nexlify host.",
      "Live PG also maps StreamProvider / WatchFolder / Ticket / EpgProgram / BlockedAsn / ActivityLog / settings when those tables exist.",
    ],
  },
  {
    id: "midnight",
    label: "Midnight Streamers",
    engine: "mysql",
    hint: "SQL dump or JSON bundle (channels / subscribers aliases).",
    steps: [
      "Export SQL or JSON from Midnight Streamers.",
      "In Nexlify: source Midnight Streamers → upload → Preview → Run import.",
    ],
    postImport: SHARED_POST_IMPORT,
    notes: [
      "Extended entities (providers, tickets, EPG guide, etc.) import when matching table names are present in the dump.",
    ],
  },
  {
    id: "nexlify_json",
    label: "Nexlify JSON",
    engine: "json",
    hint: "Universal JSON interchange for manual exports or scripts.",
    steps: [
      "Prepare a Nexlify JSON bundle (see docs/MIGRATION.md).",
      "Choose Nexlify JSON → upload .json → Preview → Run import.",
    ],
    postImport: SHARED_POST_IMPORT,
    notes: [],
  },
];

export function guidePathFor(source: MigrationSource): MigrationGuidePath | undefined {
  return MIGRATION_GUIDE_PATHS.find((p) => p.id === source);
}

export function defaultDatabaseFor(source: MigrationSource): string | undefined {
  return guidePathFor(source)?.defaultDatabase;
}
