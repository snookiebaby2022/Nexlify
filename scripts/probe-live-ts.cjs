#!/usr/bin/env node
const path = require("path");
const fs = require("fs");
process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const { execFileSync } = require("child_process");

(async () => {
  const p = new PrismaClient();
  const line = await p.line.findFirst({
    where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    select: { username: true, password: true },
  });
  if (!line) throw new Error("no active line");
  const sid = process.argv[2] || "1772235709";
  const ts = `http://209.237.141.15:8080/live/${encodeURIComponent(line.username)}/${encodeURIComponent(line.password)}/${sid}.ts`;
  const out = execFileSync(
    "curl",
    ["-sS", "-m", "20", "-o", "/dev/null", "-w", "ts_http=%{http_code} bytes=%{size_download} ct=%{content_type}\n", ts],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  );
  process.stdout.write(out);
  await p.$disconnect();
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
