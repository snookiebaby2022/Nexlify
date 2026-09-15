#!/usr/bin/env node
const path = require("path");
process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const { execSync } = require("child_process");

(async () => {
  const p = new PrismaClient();
  const line = await p.line.findFirst({
    where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    select: { username: true, password: true },
  });
  if (!line) throw new Error("no active line");
  const q = new URLSearchParams(line);
  const login = `http://209.237.141.15:8080/player_api.php?${q}`;
  const raw = execSync(`curl -sS -m 20 "${login}"`, { encoding: "utf8" });
  const j = JSON.parse(raw);
  console.log("auth", j.user_info?.auth, "server", j.server_info?.url, j.server_info?.port);
  const live = JSON.parse(
    execSync(`curl -sS -m 45 "http://209.237.141.15:8080/player_api.php?${q}&action=get_live_streams"`, {
      encoding: "utf8",
    })
  );
  console.log("live_count", live.length);
  const sid = live[0]?.stream_id;
  if (sid) {
    const ts = `http://209.237.141.15:8080/live/${line.username}/${line.password}/${sid}.ts`;
    console.log(
      execSync(`curl -sS -m 15 -o /dev/null -w "ts http=%{http_code} bytes=%{size_download} ct=%{content_type}\\n" "${ts}"`, {
        encoding: "utf8",
      })
    );
  }
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
