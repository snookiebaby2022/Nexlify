#!/usr/bin/env node
/** Test live-auth from 10gbs to panel :8080 (same path the edge uses). */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { execSync } = require("child_process");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");
const { PrismaClient } = require("@prisma/client");

(async () => {
  const p = new PrismaClient();
  const server = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  const smoke = JSON.parse(execSync("node scripts/ensure-smoke-playback.cjs 2>/dev/null | tail -1", { encoding: "utf8" }).trim());
  const panel = process.env.PANEL_PUBLIC_HOST || "45.88.138.18";
  const uri = `/live/${smoke.u}/${encodeURIComponent(smoke.p)}/${smoke.streamId}.ts`;
  const probe = `
curl -sS -m 12 -D - -o /dev/null \\
  -H 'authorization: Bearer ${server.agentToken}' \\
  -H 'x-nexlify-agent-server-id: ${server.id}' \\
  -H 'x-original-uri: ${uri}' \\
  -H 'x-original-method: GET' \\
  -H 'x-forwarded-for: 127.0.0.1' \\
  -A 'VLC/3.0.20 LibVLC/3.0.20' \\
  'http://${panel}:8080/api/internal/live-auth' | head -22
`;
  await withSshClient(await get10gbsServer(p), async (c) => {
    const r = await sshExec(c, probe);
    console.log(r.stdout);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
