#!/usr/bin/env node
/**
 * Retained synthetic live fixture for server 75 playback proof.
 * Creates provider + stream + bouquet + _smoke_test line with test-pattern upstream.
 */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient, StreamType } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const FIXTURE_PATH = "/root/.nexlify-75-playback-fixture.json";
const PROVIDER_NAME = "NEXLIFY_SMOKE_SYNTHETIC";
const STREAM_NAME = "Nexlify Smoke Test Pattern";
const BOUQUET_NAME = "Smoke Playback";

async function main() {
  const prisma = new PrismaClient();
  const host = process.env.PANEL_PRIMARY_DOMAIN?.trim() || "127.0.0.1";
  const rtmpBase = `rtmp://${host}/live`;
  const hlsUrl = `http://${host}/hls/smoke-test/index.m3u8`;
  const streamUrl = hlsUrl;

  let server = await prisma.streamServer.findFirst({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  if (!server) {
    server = await prisma.streamServer.create({
      data: {
        name: "Local Panel",
        host,
        port: 8080,
        protocol: "http",
        isActive: true,
        healthStatus: "online",
        bandwidthMbps: 1000,
      },
    });
  }

  let provider = await prisma.streamProvider.findFirst({ where: { name: PROVIDER_NAME } });
  if (!provider) {
    provider = await prisma.streamProvider.create({
      data: {
        name: PROVIDER_NAME,
        baseUrl: rtmpBase,
        providerType: "generic_url",
        isActive: true,
        status: "online",
        notes: "Retained synthetic fixture — do not delete",
      },
    });
  }

  let stream = await prisma.stream.findFirst({
    where: { name: STREAM_NAME, type: StreamType.LIVE },
  });
  if (!stream) {
    const maxNum = await prisma.stream.aggregate({
      where: { type: StreamType.LIVE },
      _max: { xtreamNum: true },
    });
    stream = await prisma.stream.create({
      data: {
        name: STREAM_NAME,
        type: StreamType.LIVE,
        streamUrl,
        isActive: true,
        serverId: server.id,
        providerId: provider.id,
        hostedExternally: true,
        lastProbeOk: true,
        lastProbeAt: new Date(),
        xtreamNum: (maxNum._max.xtreamNum ?? 100000) + 1,
      },
    });
  } else {
    await prisma.stream.update({
      where: { id: stream.id },
      data: {
        streamUrl,
        isActive: true,
        serverId: server.id,
        providerId: provider.id,
        lastProbeOk: true,
        lastProbeAt: new Date(),
      },
    });
  }

  let bouquet = await prisma.bouquet.findFirst({ where: { name: BOUQUET_NAME } });
  if (!bouquet) {
    bouquet = await prisma.bouquet.create({
      data: { name: BOUQUET_NAME, isActive: true },
    });
  }
  await prisma.bouquetStream.upsert({
    where: { bouquetId_streamId: { bouquetId: bouquet.id, streamId: stream.id } },
    create: { bouquetId: bouquet.id, streamId: stream.id, sortOrder: 0 },
    update: {},
  });

  execSync("node scripts/ensure-smoke-test-line.cjs", { stdio: "inherit" });
  const lineOut = execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", {
    encoding: "utf8",
  }).trim();
  const creds = JSON.parse(lineOut);

  const fixture = {
    at: new Date().toISOString(),
    host,
    providerId: provider.id,
    streamId: stream.id,
    bouquetId: bouquet.id,
    streamUrl,
    rtmpPublish: `${rtmpBase}/smoke-test`,
    username: creds.u,
    password: creds.p,
  };
  fs.writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(fixture));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
