import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { PanelRole } from "@prisma/client";

export async function assertMagDeviceAccess(session: SessionUser, deviceId: string) {
  const device = await prisma.magDevice.findUnique({
    where: { id: deviceId },
    include: { line: { select: { ownerId: true } } },
  });
  if (!device) throw new Error("MAG device not found");
  if (session.role !== PanelRole.ADMIN && device.line.ownerId !== session.id) {
    throw new Error("Forbidden");
  }
  return device;
}

export async function assertEnigmaDeviceAccess(session: SessionUser, deviceId: string) {
  const device = await prisma.enigmaDevice.findUnique({
    where: { id: deviceId },
    include: { line: { select: { ownerId: true } } },
  });
  if (!device) throw new Error("Enigma device not found");
  if (session.role !== PanelRole.ADMIN && device.line.ownerId !== session.id) {
    throw new Error("Forbidden");
  }
  return device;
}

export async function assertOwnedLine(session: SessionUser, lineId: string) {
  const line = await prisma.line.findUnique({
    where: { id: lineId },
    select: { id: true, ownerId: true },
  });
  if (!line) throw new Error("Line not found");
  if (session.role !== PanelRole.ADMIN && line.ownerId !== session.id) {
    throw new Error("Forbidden");
  }
  return line;
}
