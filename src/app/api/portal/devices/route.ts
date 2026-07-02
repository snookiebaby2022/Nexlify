import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/portal-session";

export async function GET() {
  const session = await getPortalSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [bindings, mags, enigmas] = await Promise.all([
    prisma.deviceBinding.findMany({
      where: { lineId: session.lineId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.magDevice.findMany({
      where: { lineId: session.lineId },
      select: { id: true, mac: true, isActive: true, createdAt: true },
      take: 20,
    }),
    prisma.enigmaDevice.findMany({
      where: { lineId: session.lineId },
      select: { id: true, mac: true, isActive: true, createdAt: true },
      take: 20,
    }),
  ]);

  return NextResponse.json({
    bindings: bindings.map((b) => ({
      id: b.id,
      deviceId: b.deviceId,
      status: b.status,
      createdAt: b.createdAt,
    })),
    magDevices: mags,
    enigmaDevices: enigmas,
  });
}
