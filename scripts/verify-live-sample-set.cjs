#!/usr/bin/env node
/** Verify multiple known-good live rows through the real Xtream MPEG-TS path. */
const http = require("http");
const { execFileSync } = require("child_process");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const root = path.join(__dirname, "..");
process.chdir(root);
require("./load-env.cjs").loadEnv();

const prisma = new PrismaClient();
const sampleSize = Math.max(1, Math.min(20, Number(process.argv[2] || 8)));

function fetchMedia(pathname, timeoutMs = 12_000) {
  return new Promise((resolve) => {
    let settled = false;
    let bytes = 0;
    let first = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 8080,
        path: pathname,
        method: "GET",
        headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20" },
        timeout: timeoutMs,
      },
      (res) => {
        res.on("data", (chunk) => {
          if (first == null && chunk.length) first = chunk[0];
          bytes += chunk.length;
          if (bytes >= 64 * 1024) {
            finish({ status: res.statusCode || 0, bytes, magic: first, media: first === 0x47 });
            req.destroy();
          }
        });
        res.on("end", () =>
          finish({ status: res.statusCode || 0, bytes, magic: first, media: first === 0x47 })
        );
        res.on("close", () =>
          finish({ status: res.statusCode || 0, bytes, magic: first, media: first === 0x47 })
        );
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => finish({ status: 0, bytes, magic: first, media: false, error: error.message }));
    req.end();
  });
}

async function main() {
  const fixtureRaw = execFileSync(process.execPath, ["scripts/ensure-smoke-playback.cjs"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
    .trim()
    .split(/\r?\n/)
    .at(-1);
  const fixture = JSON.parse(fixtureRaw);

  const streams = await prisma.stream.findMany({
    where: {
      type: "LIVE",
      isActive: true,
      lastProbeOk: true,
      xtreamNum: { not: null },
    },
    select: { xtreamNum: true },
    orderBy: { updatedAt: "desc" },
    take: sampleSize,
  });

  const results = [];
  for (const stream of streams) {
    const id = stream.xtreamNum;
    if (id == null) continue;
    const result = await fetchMedia(
      `/live/${encodeURIComponent(fixture.u)}/${encodeURIComponent(fixture.p)}/${id}.ts`
    );
    results.push({ id, ...result });
  }

  const media = results.filter((result) => result.media).length;
  const http200 = results.filter((result) => result.status === 200).length;
  console.log(JSON.stringify({ tested: results.length, media, http200, results }, null, 2));
  if (!results.length || media === 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
