#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const fs = require("fs");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const urls = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/5",
      "https://junki3monk3y.com/live/Blade2nd/PaaJhvNbqX/5.ts",
      "http://junki3monk3y.com/live/Blade2nd/PaaJhvNbqX/5.ts",
    ];

(async () => {
  const trace = fs.readFileSync(require("path").join(__dirname, "trace-upstream-redirects.cjs"), "utf8");
  const p = new (require("@prisma/client").PrismaClient)();
  const { host, port, user, password } = await get10gbsServer(p);
  await withSshClient({ host, port, user, password }, async (c) => {
    await sshExec(c, "cat > /tmp/trace-upstream-redirects.cjs", { stdin: trace });
    for (const url of urls) {
      const r = await sshExec(c, `node /tmp/trace-upstream-redirects.cjs ${JSON.stringify(url)} 2>&1`);
      console.log(`=== ${url} ===\n${r.stdout}\n`);
    }
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
