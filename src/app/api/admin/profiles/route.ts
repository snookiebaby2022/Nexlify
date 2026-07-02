import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 200), 500);
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const type = req.nextUrl.searchParams.get("type") ?? "all";

  const profiles: {
    id: string;
    type: "device" | "mag" | "enigma";
    identifier: string;
    deviceName: string | null;
    deviceType: string | null;
    lineUsername: string | null;
    ip: string | null;
    userAgent: string | null;
    status: string;
    lastSeenAt: string;
    createdAt: string;
  }[] = [];

  if (type === "all" || type === "device") {
    const deviceWhere: Record<string, unknown> = {};
    if (q) {
      deviceWhere.OR = [
        { deviceId: { contains: q, mode: "insensitive" } },
        { deviceName: { contains: q, mode: "insensitive" } },
        { ip: { contains: q, mode: "insensitive" } },
      ];
    }
    const devices = await prisma.deviceBinding.findMany({
      where: deviceWhere,
      orderBy: { lastSeenAt: "desc" },
      take: limit,
      include: { line: { select: { username: true } } },
    });
    for (const d of devices) {
      profiles.push({
        id: d.id,
        type: "device",
        identifier: d.deviceId,
        deviceName: d.deviceName ?? d.deviceModel,
        deviceType: d.deviceType,
        lineUsername: d.line?.username ?? null,
        ip: d.ip,
        userAgent: d.userAgent,
        status: d.status,
        lastSeenAt: d.lastSeenAt.toISOString(),
        createdAt: d.createdAt.toISOString(),
      });
    }
  }

  if (type === "all" || type === "mag") {
    const magWhere: Record<string, unknown> = {};
    if (q) {
      magWhere.OR = [
        { mac: { contains: q, mode: "insensitive" } },
        { model: { contains: q, mode: "insensitive" } },
      ];
    }
    const mags = await prisma.magDevice.findMany({
      where: magWhere,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { line: { select: { username: true } } },
    });
    for (const m of mags) {
      profiles.push({
        id: m.id,
        type: "mag",
        identifier: m.mac,
        deviceName: m.model,
        deviceType: "mag",
        lineUsername: m.line?.username ?? null,
        ip: null,
        userAgent: null,
        status: m.isActive ? "ACTIVE" : "INACTIVE",
        lastSeenAt: m.updatedAt.toISOString(),
        createdAt: m.createdAt.toISOString(),
      });
    }
  }

  if (type === "all" || type === "enigma") {
    const enigmaWhere: Record<string, unknown> = {};
    if (q) {
      enigmaWhere.OR = [
        { mac: { contains: q, mode: "insensitive" } },
        { model: { contains: q, mode: "insensitive" } },
      ];
    }
    const enigmas = await prisma.enigmaDevice.findMany({
      where: enigmaWhere,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { line: { select: { username: true } } },
    });
    for (const e of enigmas) {
      profiles.push({
        id: e.id,
        type: "enigma",
        identifier: e.mac,
        deviceName: e.model,
        deviceType: "enigma",
        lineUsername: e.line?.username ?? null,
        ip: null,
        userAgent: null,
        status: e.isActive ? "ACTIVE" : "INACTIVE",
        lastSeenAt: e.updatedAt.toISOString(),
        createdAt: e.createdAt.toISOString(),
      });
    }
  }

  profiles.sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());

  return NextResponse.json({ profiles: profiles.slice(0, limit) });
}
