import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import {
  getSettingGroup,
  instantStreamingPanelDefaults,
  setSettingGroup,
  type SettingGroup,
} from "@/lib/panel-settings";

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
        maxClients: 1200,
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

  const instant = instantStreamingPanelDefaults();
  for (const [group, patch] of Object.entries(instant)) {
    if (!patch) continue;
    const g = group as SettingGroup;
    const current = await getSettingGroup(g);
    await setSettingGroup(g, { ...current, ...patch });
  }
  await setSettingGroup("streams", {
    ...(await getSettingGroup("streams")),
    _instantStreamingDefaultsV1: true,
  });
  steps.push("Applied instant-start streaming defaults (anti-freeze, fast zap, cache, VOD burst)");

  if (!process.env.REDIS_URL?.trim()) {
    steps.push("Tip: set REDIS_URL=redis://127.0.0.1:6379 in .env for Fast Zap Redis cache");
  } else {
    steps.push("Redis URL configured");
  }

  return NextResponse.json({ ok: true, steps, serverId: server.id });
}
