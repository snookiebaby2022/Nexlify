#!/usr/bin/env node
/**
 * Fail hard when prisma/schema.prisma is ahead of PostgreSQL.
 *
 * Prevents: overlay newer schema → prisma generate → rebuild/swap → Prisma
 * queries missing columns (e.g. StreamServer.outboundMode) → admin UI
 * "The panel failed to load".
 *
 *   node scripts/assert-prisma-db-parity.cjs
 *   node scripts/assert-prisma-db-parity.cjs --json
 *   node scripts/assert-prisma-db-parity.cjs --allow-pending-history
 *
 * Exit 0 = OK, 1 = mismatch.
 */
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
process.chdir(ROOT);
require("./load-env.cjs").loadEnv();

const wantJson = process.argv.includes("--json");
const allowPendingHistory = process.argv.includes("--allow-pending-history");
const url = process.env.DATABASE_URL;

function fail(msg, extra = {}) {
  if (wantJson) {
    console.log(JSON.stringify({ ok: false, error: msg, ...extra }, null, 2));
  } else {
    console.error(`ERROR: assert-prisma-db-parity: ${msg}`);
    if (extra.missing?.length) {
      for (const m of extra.missing.slice(0, 40)) console.error(`  - missing ${m}`);
      if (extra.missing.length > 40) console.error(`  … +${extra.missing.length - 40} more`);
    }
    if (extra.pendingMigrations?.length) {
      console.error(`  pending migrations: ${extra.pendingMigrations.join(", ")}`);
    }
    if (extra.hint) console.error(`HINT: ${extra.hint}`);
  }
  process.exit(1);
}

function succeed(payload) {
  if (wantJson) console.log(JSON.stringify({ ok: true, ...payload }, null, 2));
  else {
    console.log(
      `assert-prisma-db-parity: OK (${payload.modelsChecked} models, ${payload.fieldsChecked} scalar/enum fields)`
    );
  }
  process.exit(0);
}

if (!url) fail("DATABASE_URL missing");

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
  const r = spawnSync("psql", [psqlUrl(url), "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `psql exit ${r.status}`).trim().slice(0, 400));
  }
  return (r.stdout || "").trim();
}

async function expectedFromDmmf() {
  // 1) Generated client embeds DMMF in many Prisma 6 builds
  try {
    const { Prisma } = require("@prisma/client");
    const modelsIn = Prisma?.dmmf?.datamodel?.models;
    if (Array.isArray(modelsIn) && modelsIn.length) {
      const models = {};
      for (const model of modelsIn) {
        const table = model.dbName || model.name;
        const columns = [];
        for (const field of model.fields) {
          if (field.kind !== "scalar" && field.kind !== "enum") continue;
          columns.push(field.dbName || field.name);
        }
        models[model.name] = { table, columns };
      }
      return models;
    }
  } catch {
    /* fall through */
  }

  // 2) DevDependency (local / full npm ci)
  for (const mod of ["@prisma/internals", "@prisma/sdk"]) {
    try {
      const { getDMMF } = require(mod);
      const datamodel = fs.readFileSync(path.join(ROOT, "prisma", "schema.prisma"), "utf8");
      const dmmf = await getDMMF({ datamodel });
      const models = {};
      for (const model of dmmf.datamodel.models) {
        const table = model.dbName || model.name;
        const columns = [];
        for (const field of model.fields) {
          if (field.kind !== "scalar" && field.kind !== "enum") continue;
          columns.push(field.dbName || field.name);
        }
        models[model.name] = { table, columns };
      }
      return models;
    } catch {
      /* try next */
    }
  }

  // 3) Schema parse fallback (no internals package on lean VPS installs)
  return expectedFromSchemaParse();
}

function expectedFromSchemaParse() {
  const schema = fs.readFileSync(path.join(ROOT, "prisma", "schema.prisma"), "utf8");
  const enums = new Set();
  for (const m of schema.matchAll(/enum\s+(\w+)\s*\{/g)) enums.add(m[1]);
  const scalars = new Set([
    "String",
    "Int",
    "BigInt",
    "Float",
    "Decimal",
    "Boolean",
    "DateTime",
    "Json",
    "Bytes",
  ]);
  const models = {};
  const modelRe = /model\s+(\w+)\s*\{([^]*?)\n\}/g;
  let m;
  while ((m = modelRe.exec(schema))) {
    const name = m[1];
    const body = m[2];
    let table = name;
    const map = body.match(/@@map\(\s*"([^"]+)"\s*\)/);
    if (map) table = map[1];
    const columns = [];
    for (const raw of body.split(/\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const fm = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?/);
      if (!fm) continue;
      const field = fm[1];
      const typ = fm[2];
      const isList = Boolean(fm[3]);
      if (isList) continue;
      if (line.includes("@relation") && !scalars.has(typ)) continue;
      if (!scalars.has(typ) && !enums.has(typ)) continue;
      const dbMap = line.match(/@map\(\s*"([^"]+)"\s*\)/);
      columns.push(dbMap ? dbMap[1] : field);
    }
    models[name] = { table, columns: [...new Set(columns)] };
  }
  return models;
}

function pendingMigrations() {
  try {
    const status = execSync("npx prisma migrate status 2>&1", {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    if (/Database schema is up to date/i.test(status)) return { pending: [], status };
    const pending = [];
    for (const line of status.split(/\n/)) {
      const t = line.trim();
      if (/^20\d{12}_/.test(t)) pending.push(t.split(/\s+/)[0]);
    }
    return { pending, status };
  } catch (e) {
    const status = String(e.stdout || e.stderr || e.message || e);
    const pending = [];
    for (const line of status.split(/\n/)) {
      const t = line.trim();
      if (/^20\d{12}_/.test(t)) pending.push(t.split(/\s+/)[0]);
    }
    return { pending, status: status.slice(0, 1200) };
  }
}

function dbColumns(table) {
  const out = psql(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${table.replace(
      /'/g,
      "''"
    )}' ORDER BY 1;`
  );
  return new Set(out ? out.split(/\n/).filter(Boolean) : []);
}

function tableExists(table) {
  return (
    psql(
      `SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='${table.replace(
        /'/g,
        "''"
      )}';`
    ) === "1"
  );
}

(async () => {
  const models = await expectedFromDmmf();
  if (!models || !Object.keys(models).length) {
    fail("Could not read models from prisma/schema.prisma");
  }

  const missing = [];
  const missingTables = [];
  let fieldsChecked = 0;
  let modelsChecked = 0;

  for (const [model, meta] of Object.entries(models)) {
    if (!meta.columns.length) continue;
    modelsChecked++;
    if (!tableExists(meta.table)) {
      missingTables.push(`${model}/${meta.table}`);
      for (const c of meta.columns) missing.push(`${meta.table}.${c}`);
      continue;
    }
    const cols = dbColumns(meta.table);
    for (const c of meta.columns) {
      fieldsChecked++;
      if (!cols.has(c)) missing.push(`${meta.table}.${c}`);
    }
  }

  const { pending, status: migrateStatus } = pendingMigrations();

  if (missing.length || missingTables.length) {
    fail("Prisma schema is ahead of the database (missing table/column).", {
      missing,
      missingTables,
      pendingMigrations: pending,
      migrateStatus: migrateStatus.slice(0, 600),
      hint:
        "On the panel host: npx prisma migrate deploy && npx prisma generate — then rebuild. " +
        "Never ship a newer schema.prisma without applying its migrations first.",
    });
  }

  if (pending.length && !allowPendingHistory) {
    fail("Pending Prisma migrations (history out of sync).", {
      pendingMigrations: pending,
      migrateStatus: migrateStatus.slice(0, 600),
      hint:
        "Run: npx prisma migrate deploy. If SQL was applied manually: " +
        "npx prisma migrate resolve --applied <migration_name>",
    });
  }

  succeed({ modelsChecked, fieldsChecked, pendingMigrations: pending });
})().catch((e) => fail(String(e?.message || e)));
