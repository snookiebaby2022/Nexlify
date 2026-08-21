#!/usr/bin/env node
const fs = require("fs");
const { execSync, spawnSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");

const pm2 = JSON.parse(execSync("pm2 jlist", { encoding: "utf8" }));
const secret = pm2.find((x) => x.name === "nexlify-iptv-edge")?.pm2_env?.env?.PANEL_INTERNAL_SECRET ?? "";

async function main() {
  const p = new PrismaClient();
  const line = await p.line.findUnique({
    where: { username: "_smoke_test" },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      maxConnections: true,
      allowedUserAgents: true,
      disallowedUserAgents: true,
    },
  });
  console.log("line", line);

  for (const ext of ["ts", "m3u8"]) {
    const uri = `/live/_smoke_test/SmokeTest2026!/cmstw2mejj94yvhyagpdlfbvw.${ext}`;
    const r = spawnSync(
      "curl",
      [
        "-sS",
        "-w",
        "\n__%{http_code}",
        "-H",
        `x-panel-internal-secret: ${secret}`,
        "-H",
        `x-original-uri: ${uri}`,
        "-H",
        "x-forwarded-for: 203.0.113.50",
        "-H",
        "user-agent: VLC/3.0.20",
        "http://127.0.0.1:13000/api/internal/live-auth",
      ],
      { encoding: "utf8" }
    );
    const parts = (r.stdout || "").split("__");
    console.log(`live-auth ${ext}:`, parts[1]?.trim(), parts[0]?.slice(0, 80));
  }

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
