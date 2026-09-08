#!/usr/bin/env node
/**
 * Point NEXLIFY_MEDIA_ORIGIN at the direct 10G edge IP so playlist live URLs
 * do not hairpin through the panel relay.
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
require("./load-env.cjs").loadEnv();

const ROOT = path.resolve(__dirname, "..");
const DIRECT = process.env.NEXLIFY_MEDIA_ORIGIN_FIX || "http://209.237.141.15";

function patchEnvFile(file) {
  if (!fs.existsSync(file)) return false;
  let raw = fs.readFileSync(file, "utf8");
  if (/^NEXLIFY_MEDIA_ORIGIN=/m.test(raw)) {
    raw = raw.replace(/^NEXLIFY_MEDIA_ORIGIN=.*$/m, `NEXLIFY_MEDIA_ORIGIN=${DIRECT}`);
  } else {
    raw = raw.trimEnd() + `\nNEXLIFY_MEDIA_ORIGIN=${DIRECT}\n`;
  }
  fs.writeFileSync(file, raw);
  return true;
}

async function main() {
  const envOk = patchEnvFile(path.join(ROOT, ".env"));
  const standOk = patchEnvFile(path.join(ROOT, ".next/standalone/.env"));
  console.log({ DIRECT, envOk, standOk });

  const p = new PrismaClient();
  const rows = await p.streamServer.findMany({
    select: { name: true, host: true, domain: true, panelSettings: true },
  });
  for (const r of rows) {
    const net = r.panelSettings?.network || {};
    console.log(
      JSON.stringify({
        name: r.name,
        host: r.host,
        domain: r.domain,
        iface: net.interfaceName || null,
        gw: net.gateway || null,
        dnsRotator: r.panelSettings?.dnsRotator || null,
      })
    );
  }
  await p.$disconnect();
  console.log("fix_MEDIA_ORIGIN_OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
