#!/usr/bin/env node
/** Quick schema audit — used on VPS fleet checks. */
const { execSync } = require("child_process");
const path = require("path");
require(path.join(__dirname, "load-env.cjs")).loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.log(JSON.stringify({ ok: false, error: "DATABASE_URL missing" }));
  process.exit(1);
}

function psqlUrl(raw) {
  try {
    const u = new URL(raw);
    u.search = "";
    return u.href;
  } catch {
    return String(raw).replace(/\?.*$/, "");
  }
}

function psql(sql) {
  return execSync(`psql ${JSON.stringify(psqlUrl(url))} -At -c ${JSON.stringify(sql)}`, {
    encoding: "utf8",
  }).trim();
}

const head = execSync("git rev-parse --short HEAD 2>/dev/null || echo unknown", {
  encoding: "utf8",
}).trim();

let migrateStatus = "unknown";
try {
  migrateStatus = execSync("npx prisma migrate status 2>&1", { encoding: "utf8" })
    .split("\n")
    .filter((l) => /migration|up to date|not yet been applied/i.test(l))
    .join(" | ");
} catch (e) {
  migrateStatus = String(e.stdout || e.message).slice(0, 200);
}

const migrationCount = psql(
  "SELECT count(*) FROM _prisma_migrations WHERE rolled_back_at IS NULL;"
);
const permissions = psql(
  "SELECT column_name FROM information_schema.columns WHERE table_name='PanelUser' AND column_name='permissions';"
);

const fs = require("fs");
const migrationDirs = fs
  .readdirSync(path.join(__dirname, "..", "prisma", "migrations"))
  .filter((d) => fs.statSync(path.join(__dirname, "..", "prisma", "migrations", d)).isDirectory())
  .sort();
const latestMigration = migrationDirs[migrationDirs.length - 1] || null;
let latestApplied = null;
if (latestMigration) {
  try {
    latestApplied = psql(
      `SELECT count(*) FROM _prisma_migrations WHERE migration_name = '${latestMigration.replace(/'/g, "''")}' AND rolled_back_at IS NULL;`
    );
  } catch {
    latestApplied = "0";
  }
}

const schemaHasPermissions = (() => {
  try {
    const s = fs.readFileSync(
      path.join(__dirname, "..", "prisma", "schema.prisma"),
      "utf8"
    );
    return /permissions\s+String\[\]/.test(s);
  } catch {
    return false;
  }
})();

const out = {
  head,
  migrationCount,
  migrationFiles: migrationDirs.length,
  latestMigration,
  latestMigrationApplied: latestApplied === "1",
  permissionsColumn: permissions || null,
  schemaHasPermissions,
  migrateStatus,
  ok:
    (!schemaHasPermissions || Boolean(permissions)) &&
    (!latestMigration || latestApplied === "1"),
};

console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
