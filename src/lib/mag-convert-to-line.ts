import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import type { SessionUser } from "@/lib/auth";
import { PanelRole } from "@prisma/client";

export async function convertMagDevicesToLines(
  session: SessionUser,
  deviceIds: string[]
): Promise<{ converted: number; lines: { username: string; id: string }[] }> {
  const uniqueIds = [...new Set(deviceIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new Error("Select at least one MAG device");
  }

  const ownerFilter =
    session.role === PanelRole.ADMIN ? {} : { line: { ownerId: session.id } };

  const devices = await prisma.magDevice.findMany({
    where: { id: { in: uniqueIds }, ...ownerFilter },
    include: { line: { select: { id: true, username: true, notes: true } } },
  });

  if (devices.length === 0) {
    throw new Error("No matching MAG devices found");
  }

  const lines: { username: string; id: string }[] = [];

  for (const device of devices) {
    const noteLine = `Converted from MAG ${device.mac}`;
    const notes = device.line.notes?.trim()
      ? `${device.line.notes.trim()}\n${noteLine}`
      : noteLine;

    await prisma.$transaction([
      prisma.magDevice.delete({ where: { id: device.id } }),
      prisma.line.update({
        where: { id: device.line.id },
        data: { notes },
      }),
    ]);

    await logActivity("mag_convert_to_line", {
      userId: session.id,
      lineId: device.line.id,
      entity: "mag",
      entityId: device.id,
      meta: { mac: device.mac, username: device.line.username },
    });

    lines.push({ id: device.line.id, username: device.line.username });
  }

  return { converted: devices.length, lines };
}
