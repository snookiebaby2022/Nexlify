#!/usr/bin/env node
/** Post-deploy check: admin hash format + login API. Reads secrets only on the server. */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const bcrypt = require("bcryptjs");

const ROOT = process.env.NEXLIFY_MARKETING_PATH || "/var/www/nexlify";
const PORT = process.env.NEXLIFY_WEB_PORT || "3001";
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

function fetchHash(email) {
  const db = fs.existsSync(path.join(ROOT, "data/nexlify.db"))
    ? path.join(ROOT, "data/nexlify.db")
    : path.join(ROOT, "prisma/dev.db");
  const emailJson = JSON.stringify(email);
  const r = spawnSync(
    "python3",
    [
      "-c",
      `
import sqlite3
conn = sqlite3.connect(${JSON.stringify(db)})
row = conn.execute("SELECT passwordHash FROM User WHERE email=?", (${emailJson},)).fetchone()
print(row[0] if row else "")
`,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(r.stderr || "failed to read password hash");
  return r.stdout.trim();
}

async function main() {
  const env = loadEnv(path.join(ROOT, ".env"));
  const email = (env.ADMIN_EMAIL || "admin@nexlify.live").toLowerCase();
  const pass = env.ADMIN_PASSWORD || "";

  if (!pass || pass.length < 8) {
    console.error("ADMIN_PASSWORD missing or too short");
    process.exit(1);
  }

  const hash = fetchHash(email);
  if (!hash) {
    console.error(`No user row for ${email}`);
    process.exit(1);
  }

  console.log("ADMIN_PASSWORD length:", pass.length);
  console.log("DB hash prefix:", hash.slice(0, 7));

  if (!BCRYPT_RE.test(hash)) {
    console.error("Corrupted bcrypt hash (missing $2 prefix)");
    process.exit(1);
  }

  const ok = await bcrypt.compare(pass, hash);
  console.log("bcrypt compare:", ok);
  if (!ok) process.exit(1);

  const res = await fetch(`http://127.0.0.1:${PORT}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pass }),
  });
  console.log("login API status:", res.status);
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
