import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { resolveLineCreateFromPackage } from "@/lib/package-line";
import { generateLinePassword } from "@/lib/credential-generate";
import type { SessionUser } from "@/lib/auth";
import { LineStatus, PanelRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export type DeviceKind = "mag" | "enigma";

function macHex(mac: string): string {
  return mac.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
}

async function uniqueUsername(
  tx: Prisma.TransactionClient,
  prefix: DeviceKind,
  mac: string
): Promise<string> {
  const hex = macHex(mac);
  const stem = `${prefix}${hex.slice(-10) || "device"}`.slice(0, 24);
  for (let n = 0; n < 50; n++) {
    const candidate = (n === 0 ? stem : `${stem}${n}`).slice(0, 32);
    const exists = await tx.line.findUnique({ where: { username: candidate } });
    if (!exists) return candidate;
  }
  return `${stem}${Date.now().toString(36)}`.slice(0, 32);
}

export async function createLineForDevice(opts: {
  session: SessionUser;
  mac: string;
  deviceKind: DeviceKind;
  packageId?: string;
  ownerId?: string;
}) {
  const resolved = await resolveLineCreateFromPackage(
    {
      packageId: opts.packageId,
      days: opts.packageId ? undefined : 30,
      maxConnections: 1,
    },
    { sellerId: opts.session.role === PanelRole.ADMIN ? null : opts.session.id }
  );

  const { assertIptvTrialAllowed } = await import("@/lib/iptv-trial-lines");
  const trialGuard = await assertIptvTrialAllowed({ isTrial: resolved.isTrial });
  if (!trialGuard.ok) throw new Error(trialGuard.error);

  const paysCredits =
    opts.session.role === PanelRole.RESELLER || opts.session.role === PanelRole.SUB_RESELLER;

  const { getResellerLineRewardPercent, applyResellerLineReward } = await import(
    "@/lib/reseller-rewards"
  );
  const rewardPercent = paysCredits && resolved.creditCost > 0 ? await getResellerLineRewardPercent() : 0;

  const line = await prisma.$transaction(async (tx) => {
    if (paysCredits && resolved.creditCost > 0) {
      const owner = await tx.panelUser.findUnique({ where: { id: opts.session.id } });
      if (!owner) throw new Error("Forbidden");
      if (owner.credits < resolved.creditCost) throw new Error("Insufficient credits");
      const afterDebit = await tx.panelUser.update({
        where: { id: opts.session.id },
        data: { credits: { decrement: resolved.creditCost } },
        select: { credits: true },
      });
      await tx.creditTransaction.create({
        data: {
          userId: opts.session.id,
          amount: -resolved.creditCost,
          balanceAfter: afterDebit.credits,
          note: `${opts.deviceKind.toUpperCase()} ${opts.mac}`,
        },
      });
      if (rewardPercent > 0) {
        await applyResellerLineReward(tx, {
          userId: opts.session.id,
          spent: resolved.creditCost,
          percent: rewardPercent,
          lineUsername: opts.mac,
        });
      }
    }

    const username = await uniqueUsername(tx, opts.deviceKind, opts.mac);
    const password = generateLinePassword();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + resolved.days);

    return tx.line.create({
      data: {
        username,
        password,
        status: LineStatus.ACTIVE,
        maxConnections: resolved.maxConnections,
        expiresAt,
        isTrial: resolved.isTrial,
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
