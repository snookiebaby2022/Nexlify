#!/usr/bin/env node
/**
 * Keep marketing admin password in sync with ADMIN_PASSWORD in .env.
 * Uses parameterized SQLite writes so bcrypt $ prefixes are never stripped by the shell.
 * Safe to run on every deploy (no-op when hash is valid and matches).
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const bcrypt = require("bcryptjs");

const ROOT = process.env.NEXLIFY_MARKETING_PATH || "/var/www/nexlify";
const DB = path.join(ROOT, "data/nexlify.db");
const BCRYPT_RE = /^\$2[aby]\$\d{2}\$/;

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function pySql(code) {
  const r = spawnSync("python3", ["-c", code], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || "python3 sqlite failed");
  }
  return r.stdout.trim();
}

function dbPath() {
  if (fs.existsSync(DB)) return DB;
  const alt = path.join(ROOT, "prisma/dev.db");
  if (fs.existsSync(alt)) return alt;
  throw new Error(`Database not found under ${ROOT}/data or prisma/`);
}

function fetchHash(email) {
  const db = dbPath();
  const emailJson = JSON.stringify(email);
  return pySql(`
import sqlite3
conn = sqlite3.connect(${JSON.stringify(db)})
row = conn.execute("SELECT passwordHash FROM User WHERE email=?", (${emailJson},)).fetchone()
print(row[0] if row else "")
`);
}

function userExists(email) {
  const db = dbPath();
  const emailJson = JSON.stringify(email);
  return pySql(`
import sqlite3
conn = sqlite3.connect(${JSON.stringify(db)})
row = conn.execute("SELECT id FROM User WHERE email=?", (${emailJson},)).fetchone()
print("yes" if row else "no")
`) === "yes";
}

function writeHash(email, hash) {
  const db = dbPath();
  const emailJson = JSON.stringify(email);
  const hashJson = JSON.stringify(hash);

  if (userExists(email)) {
    pySql(`
import sqlite3
conn = sqlite3.connect(${JSON.stringify(db)})
conn.execute("UPDATE User SET passwordHash=?, role='ADMIN' WHERE email=?", (${hashJson}, ${emailJson}))
conn.commit()
`);
    return "updated";
  }

  const id = `admin_${Date.now()}`;
  pySql(`
import sqlite3
conn = sqlite3.connect(${JSON.stringify(db)})
conn.execute(
  "INSERT INTO User (id, email, passwordHash, name, role, trialBypass, createdAt, updatedAt) VALUES (?, ?, ?, 'Admin', 'ADMIN', 0, datetime('now'), datetime('now'))",
  (${JSON.stringify(id)}, ${emailJson}, ${hashJson})
)
conn.commit()
`);
  return "created";
}

function isCorruptedHash(hash) {
  return !hash || !BCRYPT_RE.test(hash);
}

async function main() {
  const env = loadEnv(path.join(ROOT, ".env"));
  const email = (process.argv[2] || env.ADMIN_EMAIL || "admin@nexlify.live").toLowerCase();
  const password = process.argv[3] || env.ADMIN_PASSWORD;
  const checkOnly = process.argv.includes("--check-only");

  if (!password || password.length < 8) {
    console.error("ADMIN_PASSWORD missing or too short in .env (min 8 chars)");
    process.exit(1);
  }

  const stored = fetchHash(email);
  let needsSync = !stored;

  if (stored && isCorruptedHash(stored)) {
    console.error(`Corrupted bcrypt hash for ${email} (prefix: ${stored.slice(0, 8)})`);
    needsSync = true;
  } else if (stored) {
    const matches = await bcrypt.compare(password, stored);
    if (!matches) {
      console.log(`ADMIN_PASSWORD out of sync with database for ${email}`);
      needsSync = true;
    }
  }

  if (!needsSync) {
    console.log(`Admin password OK for ${email}`);
    return;
  }

  if (checkOnly) {
    console.error(`Admin password needs sync for ${email}`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  const action = writeHash(email, hash);
  const verifyStored = fetchHash(email);

  if (isCorruptedHash(verifyStored)) {
    console.error("Verify FAILED: stored hash still corrupted after write");
    process.exit(1);
  }

  const ok = await bcrypt.compare(password, verifyStored);
  if (!ok) {
    console.error("Verify FAILED: password does not match stored hash");
    process.exit(1);
  }

  console.log(`${action === "created" ? "Created" : "Updated"} admin password for ${email}`);
  console.log("Verify: password OK");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
