#!/usr/bin/env node
/** Install Redis on 10gbs edge + restart edge. Run on panel. */
const fs = require("fs");
const path = require("path");
process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");
const remote = fs.readFileSync(path.join(__dirname, "install-edge-redis-remote.sh"), "utf8");

(async () => {
  const p = new PrismaClient();
  const s = await get10gbsServer(p);
  await withSshClient(
    { host: s.host, port: s.port, username: s.user, password: s.password },
    async (c) => {
      const r = await sshExec(c, "bash -s", { stdin: remote, timeoutMs: 300_000 });
      process.stdout.write(r.stdout || "");
      if (r.stderr) process.stderr.write(String(r.stderr).slice(0, 3000));
      if (r.code) process.exitCode = 1;
    }
  );
  const { execSync } = require("child_process");
  console.log("--- from panel ---");
  for (const [label, url] of [
    ["80", "http://209.237.141.15/edge/health"],
    ["8080", "http://209.237.141.15:8080/edge/health"],
    ["25461", "http://209.237.141.15:25461/edge/health"],
    ["443", "https://209.237.141.15/edge/health"],
  ]) {
    console.log(
      execSync(`curl -skS -m 5 -o /dev/null -w '10gbs:${label}=%{http_code}\\n' '${url}'`, {
        encoding: "utf8",
      })
    );
  }
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
