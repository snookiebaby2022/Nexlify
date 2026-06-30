import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { getSettingGroup, setSettingGroup } from "@/lib/panel-settings";

export async function POST() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const steps: string[] = [];

  let server = await prisma.streamServer.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  if (!server) {
    server = await prisma.streamServer.create({
      data: {
        id: "setup-server-main",
        name: "Main Server",
        host: "127.0.0.1",
        port: 8080,
        protocol: "http",
        maxClients: 1000,
        isActive: true,
      },
    });
    steps.push("Created Main Server");
  } else {
    steps.push("Server already exists");
  }

  for (const type of ["LIVE", "MOVIE", "SERIES", "RADIO"] as const) {
    const exists = await prisma.category.findFirst({ where: { name: `Default ${type}`, categoryType: type } });
    if (!exists) {
      await prisma.category.create({
        data: { name: `Default ${type}`, categoryType: type, sortOrder: 0 },
      });
      steps.push(`Category: Default ${type}`);
    }
  }

  const liveCat = await prisma.category.findFirst({ where: { categoryType: "LIVE" } });
  void liveCat;

  let bouquet = await prisma.bouquet.findFirst({ where: { name: "full" } });
  if (!bouquet) {
    bouquet = await prisma.bouquet.create({
      data: { name: "full", isActive: true, sortOrder: 0 },
    });
    steps.push('Bouquet: "full" (empty — assign your streams)');
  } else {
    steps.push('Bouquet "full" already exists');
  }

  const streamsSettings = await getSettingGroup("streams");
  const cacheSettings = await getSettingGroup("cache");
  const needsStreams = streamsSettings.antiFreezeEnabled === false || streamsSettings.fastZapEnabled === false;
  const needsPrefetch =
    Number(streamsSettings.zapPrefetchNeighbors ?? 0) < 2 ||
    streamsSettings.zapPrefetchOnLiveHit === false;

  if (needsStreams || needsPrefetch) {
    await setSettingGroup("streams", {
      ...streamsSettings,
      antiFreezeEnabled: true,
      fastZapEnabled: true,
      nginxBufferLive: false,
      zapPrefetchNeighbors: Math.max(3, Number(streamsSettings.zapPrefetchNeighbors ?? 3)),
      zapPrefetchOnLiveHit: true,
      playbackUrlCacheTtlSec: Number(streamsSettings.playbackUrlCacheTtlSec ?? 60) || 60,
    });
    steps.push("Enabled anti-freeze + fast zap + neighbour prefetch");
  } else {
    steps.push("Anti-freeze stack already enabled");
  }

  if (!cacheSettings.playbackUrlCacheTtlSec) {
    await setSettingGroup("cache", { ...cacheSettings, playbackUrlCacheTtlSec: 30 });
    steps.push("Set cache playback URL TTL");
  }

  const activeServers = await prisma.streamServer.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  if (activeServers.length) {
    const { bumpConfigRevision } = await import("@/lib/stream-agent");
    for (const s of activeServers) {
      await bumpConfigRevision(s.id);
    }
    steps.push(`Pushed anti-freeze agent config to ${activeServers.length} server(s)`);
  }

  return NextResponse.json({
    ok: true,
    steps,
    bouquetId: bouquet.id,
    m3uHint: "Create a line and assign bouquets under Users → Manage Lines",
  });
}
