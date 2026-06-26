import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { resolveLineCreateFromPackage } from "@/lib/package-line";
import { generateLinePassword } from "@/lib/credential-generate";
import type { SessionUser } from "@/lib/auth";
import { LineStatus, PanelRole } from "@prisma/client";

export type DeviceKind = "mag" | "enigma";

function macHex(mac: string): string {
  return mac.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
}

async function uniqueUsername(prefix: DeviceKind, mac: string): Promise<string> {
  const hex = macHex(mac);
  const base = `${prefix}${hex.slice(-10) || "device"}`.slice(0, 32);
  let candidate = base;
  let n = 0;
  while (await prisma.line.findUnique({ where: { username: candidate } })) {
    n += 1;
    candidate = `${base}${n}`.slice(0, 32);
  }
  return candidate;
}

export async function createLineForDevice(opts: {
  session: SessionUser;
  mac: string;
  deviceKind: DeviceKind;
  packageId?: string;
  ownerId?: string;
}) {
  const resolved = await resolveLineCreateFromPackage({
    packageId: opts.packageId,
    days: opts.packageId ? undefined : 30,
    maxConnections: 1,
  });

  const paysCredits =
    opts.session.role === PanelRole.RESELLER || opts.session.role === PanelRole.SUB_RESELLER;

  if (paysCredits && resolved.creditCost > 0) {
    const owner = await prisma.panelUser.findUnique({ where: { id: opts.session.id } });
    if (!owner) throw new Error("Forbidden");
    if (owner.credits < resolved.creditCost) throw new Error("Insufficient credits");
    await prisma.panelUser.update({
      where: { id: opts.session.id },
      data: { credits: { decrement: resolved.creditCost } },
    });
    await prisma.creditTransaction.create({
      data: {
        userId: opts.session.id,
        amount: -resolved.creditCost,
        balanceAfter: owner.credits - resolved.creditCost,
        note: `${opts.deviceKind.toUpperCase()} ${opts.mac}`,
      },
    });
  }

  const username = await uniqueUsername(opts.deviceKind, opts.mac);
  const password = generateLinePassword();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + resolved.days);

  const line = await prisma.line.create({
    data: {
      username,
      password,
      status: LineStatus.ACTIVE,
      maxConnections: resolved.maxConnections,
      expiresAt,
      notes: `${opts.deviceKind === "mag" ? "MAG" : "Enigma2"} · ${opts.mac}`,
      ownerId:
        opts.session.role === PanelRole.ADMIN
          ? opts.ownerId || undefined
          : opts.session.id,
      bouquets: {
        create: resolved.bouquetIds.map((bouquetId) => ({ bouquetId })),
      },
    },
  });

  await logActivity("create_line", {
    userId: opts.session.id,
    lineId: line.id,
    entity: "line",
    entityId: line.id,
    meta: { deviceKind: opts.deviceKind, mac: opts.mac, packageId: opts.packageId ?? null },
  });

  return line;
}
