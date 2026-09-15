#!/usr/bin/env node
/** Probe Xtream player_api auth (run on panel host). */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const http = require("http");
const { PrismaClient } = require("@prisma/client");

function get(path, host, port = 80) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: "127.0.0.1", port, path, headers: { Host: host, "User-Agent": "XCIPTV" }, timeout: 20000 },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ status: res.statusCode, body: d.slice(0, 2000) }));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });
}

(async () => {
  const p = new PrismaClient();
  const line = await p.line.findFirst({
    where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    orderBy: { updatedAt: "desc" },
    select: { username: true, password: true },
  });
  if (!line) throw new Error("no active line");
  const q = `username=${encodeURIComponent(line.username)}&password=${encodeURIComponent(line.password)}`;
  const paths = [
    { label: "panel:80", port: 80, path: `/player_api.php?${q}` },
    { label: "edge:8080", port: 8080, path: `/player_api.php?${q}` },
  ];
  const out = {};
  for (const t of paths) {
    try {
      const r = await get(t.path, "darkcdn.store", t.port);
      let auth = null;
      try {
        auth = JSON.parse(r.body).user_info?.auth;
      } catch {
        /* ignore */
      }
      out[t.label] = { status: r.status, auth, snippet: r.body.slice(0, 120) };
    } catch (e) {
      out[t.label] = { error: String(e.message || e) };
    }
  }
  console.log(JSON.stringify({ line: line.username, ...out }, null, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
