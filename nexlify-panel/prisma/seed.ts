import { PrismaClient, PanelRole, StreamType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash("admin123", 10);
  const resellerHash = await bcrypt.hash("reseller123", 10);

  const admin = await prisma.panelUser.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      passwordHash: adminHash,
      role: PanelRole.ADMIN,
      credits: 999999,
      apiKey: "demo-admin-api-key-change-in-production",
      accessCode: "adminapi",
    },
  });

  const reseller = await prisma.panelUser.upsert({
    where: { username: "reseller" },
    update: {},
    create: {
      username: "reseller",
      passwordHash: resellerHash,
      role: PanelRole.RESELLER,
      credits: 100,
      parentId: admin.id,
      maxLines: 200,
    },
  });

  const mainServer = await prisma.streamServer.upsert({
    where: { id: "seed-server-main" },
    update: {},
    create: {
      id: "seed-server-main",
      name: "Main Server",
      host: "127.0.0.1",
      port: 8080,
      protocol: "http",
      maxClients: 1000,
    },
  });

  const sports = await prisma.category.upsert({
    where: { id: "seed-cat-sports" },
    update: {},
    create: { id: "seed-cat-sports", name: "Sports", sortOrder: 1 },
  });

  const movies = await prisma.category.upsert({
    where: { id: "seed-cat-movies" },
    update: {},
    create: { id: "seed-cat-movies", name: "Movies", sortOrder: 2 },
  });

  const stream1 = await prisma.stream.upsert({
    where: { id: "seed-stream-1" },
    update: { serverId: mainServer.id },
    create: {
      id: "seed-stream-1",
      name: "Demo Sports HD",
      streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      type: StreamType.LIVE,
      categoryId: sports.id,
      serverId: mainServer.id,
    },
  });

  const stream2 = await prisma.stream.upsert({
    where: { id: "seed-stream-2" },
    update: { serverId: mainServer.id },
    create: {
      id: "seed-stream-2",
      name: "Demo Movie",
      streamUrl: "https://test-streams.mux.dev/pts/pts.m3u8",
      type: StreamType.MOVIE,
      categoryId: movies.id,
      serverId: mainServer.id,
    },
  });

  const basic = await prisma.bouquet.upsert({
    where: { id: "seed-bouquet-basic" },
    update: {},
    create: {
      id: "seed-bouquet-basic",
      name: "Basic Package",
    },
  });

  await prisma.bouquetStream.upsert({
    where: {
      bouquetId_streamId: { bouquetId: basic.id, streamId: stream1.id },
    },
    update: {},
    create: { bouquetId: basic.id, streamId: stream1.id },
  });

  await prisma.bouquetStream.upsert({
    where: {
      bouquetId_streamId: { bouquetId: basic.id, streamId: stream2.id },
    },
    update: {},
    create: { bouquetId: basic.id, streamId: stream2.id },
  });

  await prisma.resellerBouquet.upsert({
    where: {
      userId_bouquetId: { userId: reseller.id, bouquetId: basic.id },
    },
    update: {},
    create: { userId: reseller.id, bouquetId: basic.id },
  });

  const expires = new Date();
  expires.setMonth(expires.getMonth() + 1);

  const demoLine = await prisma.line.upsert({
    where: { username: "demo" },
    update: {},
    create: {
      username: "demo",
      password: "demo123",
      maxConnections: 2,
      expiresAt: expires,
      externalId: "whmcs-demo-1001",
      ownerId: reseller.id,
      bouquets: { create: [{ bouquetId: basic.id }] },
    },
  });

  await prisma.stream.update({
    where: { id: stream1.id },
    data: { epgChannelId: "demo.sports.hd" },
  });

  await prisma.magDevice.upsert({
    where: { mac: "00:1A:79:00:00:01" },
    update: {},
    create: {
      mac: "00:1A:79:00:00:01",
      lineId: demoLine.id,
      model: "MAG254",
    },
  });

  const epgSource = await prisma.epgSource.upsert({
    where: { id: "seed-epg-demo" },
    update: {},
    create: {
      id: "seed-epg-demo",
      name: "Demo EPG",
      url: "https://example.com/epg.xml",
      isActive: false,
    },
  });

  const epgStart = new Date();
  const epgEnd = new Date(epgStart.getTime() + 3600000);
  await prisma.epgProgram.upsert({
    where: { id: "seed-epg-prog-1" },
    update: {},
    create: {
      id: "seed-epg-prog-1",
      sourceId: epgSource.id,
      channelId: "demo.sports.hd",
      title: "Demo Match",
      description: "Sample EPG listing",
      start: epgStart,
      stop: epgEnd,
    },
  });

  await prisma.panelSetting.upsert({
    where: { key: "panel_name" },
    update: { value: "Nexlify" },
    create: { key: "panel_name", value: "Nexlify" },
  });

  console.log("Seed complete — Nexlify");
  console.log("Admin: admin / admin123");
  console.log("Reseller: reseller / reseller123");
  console.log("Demo line: demo / demo123");
  console.log("Demo MAG MAC: 00:1A:79:00:00:01");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
