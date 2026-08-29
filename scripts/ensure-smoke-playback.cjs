#!/usr/bin/env node
/** Pick a probed-ok live stream for smoke tests + output creds + streamId. */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const { execSync } = require("child_process");
const http = require("http");

function edgeReturnsMedia(creds, id, timeoutMs = 8_000) {
  return new Promise((resolve) => {
    let settled = false;
    let bytes = 0;
    let magic = null;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 8080,
        path: `/live/${encodeURIComponent(creds.u)}/${encodeURIComponent(creds.p)}/${id}.ts`,
        headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20" },
        timeout: timeoutMs,
      },
      (res) => {
        res.on("data", (chunk) => {
          if (magic == null && chunk.length) magic = chunk[0];
          bytes += chunk.length;
          if (magic === 0x47 && bytes >= 1880) {
            finish(true);
            req.destroy();
          }
        });
        res.on("end", () => finish(false));
        res.on("close", () => finish(magic === 0x47 && bytes >= 1880));
      }
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => finish(false));
    req.end();
  });
}

(async () => {
  const p = new PrismaClient();
  const lineJson = execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", { encoding: "utf8" }).trim();
  if (!lineJson.startsWith("{")) throw new Error(`bad smoke line output: ${lineJson.slice(0, 80)}`);
  const creds = JSON.parse(lineJson);
  const streams = await p.stream.findMany({
    where: { type: "LIVE", isActive: true, lastProbeOk: true, xtreamNum: { not: null } },
    orderBy: { lastProbeAt: "desc" },
    take: 20,
    select: { id: true, xtreamNum: true, name: true },
  });
  let stream = null;
  for (const candidate of streams) {
    if (candidate.xtreamNum != null && (await edgeReturnsMedia(creds, candidate.xtreamNum))) {
      stream = candidate;
      break;
    }
  }
  if (!stream) throw new Error("no probed-ok live stream");
  console.log(JSON.stringify({ ...creds, streamId: stream.xtreamNum, recordId: stream.id, xtreamId: stream.xtreamNum, name: stream.name }));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
