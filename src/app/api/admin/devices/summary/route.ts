import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const lineFilter = session.role === PanelRole.ADMIN ? {} : { line: { ownerId: session.id } };

  const [magTotal, magActive, enigmaTotal, enigmaActive, recentMag, recentEnigma, serverSettings] =
    await Promise.all([
      prisma.magDevice.count({ where: lineFilter }),
      prisma.magDevice.count({ where: { ...lineFilter, isActive: true } }),
      prisma.enigmaDevice.count({ where: lineFilter }),
      prisma.enigmaDevice.count({ where: { ...lineFilter, isActive: true } }),
      prisma.magDevice.findMany({
        where: lineFilter,
        take: 8,
        orderBy: { updatedAt: "desc" },
        include: { line: { select: { username: true, expiresAt: true, status: true } } },
      }),
      prisma.enigmaDevice.findMany({
        where: lineFilter,
        take: 8,
        orderBy: { updatedAt: "desc" },
        include: { line: { select: { username: true, expiresAt: true, status: true } } },
      }),
      getSettingGroup("server"),
    ]);

  const stbEvents = await prisma.stbEvent.findMany({
    take: 15,
    orderBy: { createdAt: "desc" },
    select: { id: true, deviceType: true, mac: true, event: true, createdAt: true },
  });

  return NextResponse.json({
    mag: { total: magTotal, active: magActive },
    enigma: { total: enigmaTotal, active: enigmaActive },
    recentMag,
    recentEnigma,
    stbEvents,
    portalUrls: {
      magServerUrl: serverSettings.magServerUrl || serverSettings.serverUrl || "",
      enigmaServerUrl: serverSettings.enigmaServerUrl || serverSettings.serverUrl || "",
      stalkerPortal: "/stalker_portal/c/",
    },
  });
}
