#!/usr/bin/env node
/** Sync admin password hash with ADMIN_PASSWORD in .env (safe parameterized SQL). */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const bcrypt = require("bcryptjs");

const ROOT = process.env.NEXLIFY_MARKETING_PATH || "/var/www/nexlify";
const DB = path.join(ROOT, "data/nexlify.db");

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

function runSql(py) {
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
  return r.stdout.trim();
}

async function main() {
  const env = loadEnv(path.join(ROOT, ".env"));
  const email = (process.argv[2] || "admin@nexlify.live").toLowerCase();
  const password = process.argv[3] || env.ADMIN_PASSWORD;

  if (!password || password.length < 8) {
    console.error("ADMIN_PASSWORD missing or too short in .env");
    process.exit(1);
  }
  if (!fs.existsSync(DB)) {
    console.error(`Database not found: ${DB}`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  const emailJson = JSON.stringify(email);
  const hashJson = JSON.stringify(hash);

  const exists = runSql(`
import sqlite3
conn = sqlite3.connect(${JSON.stringify(DB)})
row = conn.execute("SELECT id FROM User WHERE email=?", (${emailJson},)).fetchone()
print("yes" if row else "no")
`);

  if (exists === "yes") {
    runSql(`
import sqlite3
conn = sqlite3.connect(${JSON.stringify(DB)})
conn.execute("UPDATE User SET passwordHash=?, role='ADMIN' WHERE email=?", (${hashJson}, ${emailJson}))
conn.commit()
`);
    console.log(`Updated password for ${email}`);
  } else {
    const id = `admin_${Date.now()}`;
    runSql(`
import sqlite3
conn = sqlite3.connect(${JSON.stringify(DB)})
conn.execute(
  "INSERT INTO User (id, email, passwordHash, name, role, trialBypass, createdAt, updatedAt) VALUES (?, ?, ?, 'Admin', 'ADMIN', 0, datetime('now'), datetime('now'))",
  (${JSON.stringify(id)}, ${emailJson}, ${hashJson})
)
conn.commit()
`);
    console.log(`Created admin user ${email}`);
  }

  const stored = runSql(`
import sqlite3
conn = sqlite3.connect(${JSON.stringify(DB)})
row = conn.execute("SELECT passwordHash FROM User WHERE email=?", (${emailJson},)).fetchone()
print(row[0] if row else "")
`);

  const ok = await bcrypt.compare(password, stored);
  console.log(ok ? "Verify: password OK" : "Verify: FAILED");
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
