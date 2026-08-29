#!/usr/bin/env node
/** Configure the remote edge to trust XFF only from the panel proxy IP. */
const path = require("path");

process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();

const { PrismaClient } = require("@prisma/client");
const {
  get10gbsServer,
  withSshClient,
  sshExec,
} = require("./ssh-10gbs-lib.cjs");

function validIp(value) {
  const text = String(value || "").trim();
  return (
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(text) &&
    text.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255)
  );
}

async function main() {
  const trustedProxyIp = process.env.TRUSTED_PROXY_IP;
  if (!validIp(trustedProxyIp)) {
    throw new Error("Set TRUSTED_PROXY_IP to the panel's IPv4 address");
  }

  const prisma = new PrismaClient();
  try {
    const server = await get10gbsServer(prisma);
    await withSshClient(
      {
        host: server.host,
        port: server.port,
        username: server.user,
        password: server.password,
      },
      async (client) => {
        const quoted = `'${trustedProxyIp.replace(/'/g, "")}'`;
        const command = [
          "set -e",
          "cd /opt/nexlify-panel",
          `export IPTV_EDGE_TRUST_XFF=${quoted}`,
          "pm2 restart nexlify-iptv-edge --update-env",
          "pm2 save",
          "sleep 5",
          "pm2 env nexlify-iptv-edge 2>/dev/null | grep '^IPTV_EDGE_TRUST_XFF:' || true",
          "ss -lntp | grep ':8080'",
        ].join(" && ");
        const result = await sshExec(client, command, { timeoutMs: 60_000 });
        process.stdout.write(result.stdout);
        process.stderr.write(result.stderr);
        if (result.code !== 0) throw new Error("remote edge configuration failed");
      }
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
