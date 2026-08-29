#!/usr/bin/env node
/** Ensure DATABASE_URL has connection_limit + pool_timeout (prevents P2037 under PM2 cluster). */
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
if (!fs.existsSync(envPath)) {
  console.log("no .env");
  process.exit(0);
}

const limit = Number(process.env.NEXLIFY_DB_CONNECTION_LIMIT || 8);
const timeout = Number(process.env.NEXLIFY_DB_POOL_TIMEOUT_SEC || 15);

let raw = fs.readFileSync(envPath, "utf8");
const lineRe = /^DATABASE_URL=(.*)$/m;
const m = raw.match(lineRe);
if (!m) {
  console.log("DATABASE_URL not in .env");
  process.exit(0);
}

function parseVal(s) {
  let v = s.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}

function quoteVal(v) {
  if (/[\s#"']/.test(v)) return `"${v.replace(/"/g, '\\"')}"`;
  return v;
}

let url = parseVal(m[1]);
try {
  const u = new URL(url.replace(/^postgres(ql)?:\/\//, "http://"));
  if (!u.searchParams.has("connection_limit")) {
    u.searchParams.set("connection_limit", String(limit));
  }
  if (!u.searchParams.has("pool_timeout")) {
    u.searchParams.set("pool_timeout", String(timeout));
  }
  if (!u.searchParams.has("connect_timeout")) {
    u.searchParams.set("connect_timeout", "10");
  }
  url = u.toString().replace(/^http:\/\//, "postgresql://");
} catch {
  const sep = url.includes("?") ? "&" : "?";
  if (!/connection_limit=/.test(url)) url += `${sep}connection_limit=${limit}`;
  if (!/pool_timeout=/.test(url)) url += `&pool_timeout=${timeout}`;
}

const next = `DATABASE_URL=${quoteVal(url)}`;
if (next !== `DATABASE_URL=${m[1]}`) {
  raw = raw.replace(lineRe, next);
  fs.writeFileSync(envPath, raw);
  console.log(`patched DATABASE_URL pool (limit=${limit} timeout=${timeout}s)`);
} else {
  console.log("DATABASE_URL pool already configured");
}
