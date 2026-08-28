#!/usr/bin/env node
/**
 * Panel capacity test: 10 public test streams + N lines (default 5000).
 * Does NOT use customer IPTV providers — upstreams are free public HLS samples.
 *
 * Usage: node scripts/load-test-setup.cjs [--lines=5000] [--dry-run] [--teardown]
 */
const { PrismaClient } = require("@prisma/client");

const PUBLIC_HLS = [
  "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8",
  "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8",
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
  "https://storage.googleapis.com/shaka-demo-assets/bbb-dark-truths-hls/hls.m3u8",
  "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8",
  "https://playertest.longtailvideo.com/adaptive/elephants_dream_v4/index.m3u8",
  "https://storage.googleapis.com/shaka-demo-assets/sintel-hls/hls.m3u8",
  "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8",
  "https://test-streams.mux.dev/test_001/stream.m3u8",
];

const LINE_TAG = "loadtest-v2053";
const STREAM_PREFIX = "Load Test Stream ";
const BOUQUET_NAME = "Load Test (panel capacity)";
const p = new PrismaClient();

function cuidToNum(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function parseArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.split("=")[1];
}

async function teardown() {
  const bouquet = await p.bouquet.findFirst({ where: { name: BOUQUET_NAME } });
  if (bouquet) {
    await p.lineBouquet.deleteMany({ where: { bouquetId: bouquet.id } });
    await p.bouquetStream.deleteMany({ where: { bouquetId: bouquet.id } });
    await p.bouquet.delete({ where: { id: bouquet.id } });
  }
  const streams = await p.stream.deleteMany({
    where: { name: { startsWith: STREAM_PREFIX } },
  });
  const lines = await p.line.deleteMany({ where: { notes: { contains: LINE_TAG } } });
  const cat = await p.category.findFirst({ where: { name: "Load Test" } });
  if (cat) await p.category.delete({ where: { id: cat.id } }).catch(() => {});
  console.log(JSON.stringify({ teardown: true, streams: streams.count, lines: lines.count }, null, 2));
}

(async () => {
  const dryRun = process.argv.includes("--dry-run");
  if (process.argv.includes("--teardown")) {
    await teardown();
    await p.$disconnect();
    return;
  }

  const lineCount = Number(parseArg("lines", "5000")) || 5000;
  let category = await p.category.findFirst({ where: { name: "Load Test" } });
  if (!category && !dryRun) {
    category = await p.category.create({ data: { name: "Load Test", categoryType: "LIVE" } });
  }

  const streamIds = [];
  for (let i = 0; i < PUBLIC_HLS.length; i++) {
    const name = `${STREAM_PREFIX}${i + 1}`;
    let row = await p.stream.findFirst({ where: { name } });
    if (!row && !dryRun) {
      row = await p.stream.create({
        data: {
          name,
          type: "LIVE",
          streamUrl: PUBLIC_HLS[i],
          isActive: true,
          categoryId: category?.id,
        },
      });
      row = await p.stream.update({
        where: { id: row.id },
        data: { xtreamNum: cuidToNum(row.id) },
      });
    }
    if (row) streamIds.push(row.id);
  }

  let bouquet = await p.bouquet.findFirst({ where: { name: BOUQUET_NAME } });
  if (!bouquet && !dryRun) {
    bouquet = await p.bouquet.create({ data: { name: BOUQUET_NAME, isActive: true } });
    for (let i = 0; i < streamIds.length; i++) {
      await p.bouquetStream.create({
        data: { bouquetId: bouquet.id, streamId: streamIds[i], sortOrder: i },
      });
    }
  }

  const existing = await p.line.count({ where: { notes: { contains: LINE_TAG } } });
  const toCreate = Math.max(0, lineCount - existing);
  const expiresAt = new Date(Date.now() + 365 * 86400000);

  if (!dryRun && toCreate > 0) {
    const batch = 200;
    for (let n = 0; n < toCreate; n += batch) {
      const chunk = [];
      for (let j = 0; j < batch && n + j < toCreate; j++) {
        const num = existing + n + j + 1;
        chunk.push({
          username: `load${String(num).padStart(5, "0")}`,
          password: `lt${num}`,
          maxConnections: 1,
          expiresAt,
          status: "ACTIVE",
          notes: `${LINE_TAG} capacity line`,
        });
      }
      await p.$transaction(
        chunk.map((data) =>
          p.line.create({
            data: {
              ...data,
              bouquets: bouquet ? { create: [{ bouquetId: bouquet.id }] } : undefined,
            },
          })
        )
      );
      console.log(`created lines ${existing + n + 1}..${existing + n + chunk.length}`);
    }
  }

  const streamsWithNums = await p.stream.findMany({
    where: { name: { startsWith: STREAM_PREFIX } },
    select: { id: true, name: true, xtreamNum: true },
    orderBy: { name: "asc" },
  });

  console.log(
    JSON.stringify(
      {
        tag: LINE_TAG,
        streams: streamsWithNums.length,
        streamXtreamNums: streamsWithNums.map((s) => s.xtreamNum),
        linesTotal: existing + toCreate,
        bouquet: bouquet?.id ?? null,
        dryRun,
        sampleLine: { username: "load00001", password: "lt1" },
        hint: "node scripts/load-test-run.cjs --host=https://your-panel --concurrency=500 --stream=XTREAM_NUM --delay-ms=3000",
      },
      null,
      2
    )
  );
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
