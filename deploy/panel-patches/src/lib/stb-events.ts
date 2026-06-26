import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function logStbEvent(opts: {
  deviceType: "mag" | "enigma" | "stalker";
  mac?: string;
  lineId?: string;
  event: string;
  meta?: Record<string, unknown>;
}) {
  await prisma.stbEvent.create({
    data: {
      deviceType: opts.deviceType,
      mac: opts.mac ?? null,
      lineId: opts.lineId ?? null,
      event: opts.event,
      meta: opts.meta ? (opts.meta as Prisma.InputJsonValue) : undefined,
    },
  });
}
