#!/usr/bin/env bash
set -euo pipefail
DB="${1:-/var/www/nexlify/data/nexlify.db}"
SQL="$(dirname "$0")/update-plan-copy.sql"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB" < "$SQL"
  echo "Plan copy updated via sqlite3"
  exit 0
fi

node --input-type=module <<'NODE'
import Database from "better-sqlite3";
const db = new Database(process.env.DB_PATH || "/var/www/nexlify/data/nexlify.db");
const fs = await import("node:fs");
const sql = fs.readFileSync("/var/www/nexlify/deploy/update-plan-copy.sql", "utf8");
for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
  db.exec(stmt + ";");
}
console.log("Plan copy updated via better-sqlite3");
NODE
