#!/usr/bin/env node
/** Compare panel/edge internal secret metadata without printing the secret. */
const crypto = require("crypto");
const path = require("path");

process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();

const { PrismaClient } = require("@prisma/client");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

function fingerprint(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

async function main() {
  const local = process.env.PANEL_INTERNAL_SECRET || "";
  console.log(`panel len=${local.length} hash=${fingerprint(local)}`);

  const prisma = new PrismaClient();
  try {
    const server = await get10gbsServer(prisma);
    await withSshClient(server, async (client) => {
      const code = [
        "const crypto=require('crypto');",
        "const {execSync}=require('child_process');",
        "const raw=execSync('pm2 env 0',{encoding:'utf8'});",
        "const m=raw.match(/^PANEL_INTERNAL_SECRET:\\s*(.*)$/m);",
        "const v=m?m[1].trim():'';",
        "console.log('edge len='+v.length+' hash='+crypto.createHash('sha256').update(v).digest('hex').slice(0,12));",
      ].join("");
      const result = await sshExec(client, `node -e ${JSON.stringify(code)}`);
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
