#!/usr/bin/env node
/** Deploy only the heartbeat reporter. Never restart the IPTV edge/playback process. */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

(async () => {
  const prisma = new PrismaClient();
  const server = await get10gbsServer(prisma);
  const source = fs.readFileSync(path.join(__dirname, "nexlify-stream-agent.sh"));

  await withSshClient(server, async (client) => {
    const active = await sshExec(
      client,
      "if systemctl is-active --quiet nexlify-stream-agent; then echo nexlify-stream-agent; elif systemctl is-active --quiet nexlify-agent; then echo nexlify-agent; fi",
    );
    const service = active.stdout.trim();
    if (!service) throw new Error("stream agent service not active");

    const unit = await sshExec(client, `systemctl show -p ExecStart --value "${service}"`);
    const scriptPaths = unit.stdout.match(/\/[^\s;{}]+\.sh\b/g) ?? [];
    const target =
      scriptPaths.find((value) => /nexlify.*agent/i.test(value)) ??
      "/opt/nexlify-stream-agent/nexlify-stream-agent.sh";
    const stage = `${target}.metrics-new`;
    let result = await sshExec(client, `base64 -d > "${stage}"`, {
      stdin: source.toString("base64"),
    });
    if (result.code !== 0) throw new Error(result.stderr || "agent upload failed");

    result = await sshExec(
      client,
      [
        `sed -i 's/\\r$//' "${stage}"`,
        `bash -n "${stage}"`,
        `chmod 0755 "${stage}"`,
        `mv "${stage}" "${target}"`,
        `systemctl restart "${service}"`,
        `systemctl is-active "${service}"`,
        `systemctl show -p ExecStart --value "${service}"`,
        `echo "deployed=${target}"`,
        "pm2 pid nexlify-iptv-edge",
      ].join("\n"),
    );
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "agent restart failed");
    process.stdout.write(result.stdout);
  });

  await prisma.$disconnect();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
