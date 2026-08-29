#!/usr/bin/env node
/** SSH to 10gbs using stored credentials and install tinyproxy. */
const fs = require("fs");
const path = require("path");
process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();

const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

async function main() {
  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient();
  const { host, port, user, password } = await get10gbsServer(p);
  const script = fs.readFileSync(path.join(__dirname, "setup-10gbs-egress-proxy.sh"), "utf8");

  console.log(`SSH ${user}@${host}:${port} …`);
  await withSshClient({ host, port, username: user, password }, async (client) => {
    const r = await sshExec(client, "bash -s", { stdin: script, timeoutMs: 180_000 });
    process.stdout.write(r.stdout);
    process.stderr.write(r.stderr);
    if (r.code !== 0) throw new Error(`remote exit ${r.code}`);
  });

  console.log("remote tinyproxy OK");
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
