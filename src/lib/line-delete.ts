import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

/** Clear relations that block `line.delete` (BillingEvent has no onDelete). */
export async function detachLineDeleteBlockers(tx: Db, lineIds: string[]): Promise<void> {
  const ids = [...new Set(lineIds.map(String).filter(Boolean))];
  if (!ids.length) return;
  await tx.billingEvent.updateMany({
    where: { lineId: { in: ids } },
    data: { lineId: null },
  });
  await tx.liveConnection.deleteMany({ where: { lineId: { in: ids } } });
}

export async function deleteManagedLines(lineIds: string[]): Promise<number> {
  const ids = [...new Set(lineIds.map(String).filter(Boolean))];
  if (!ids.length) return 0;
  return prisma.$transaction(async (tx) => {
    await detachLineDeleteBlockers(tx, ids);
    const result = await tx.line.deleteMany({ where: { id: { in: ids } } });
    return result.count;
  });
}

export async function deleteManagedLine(lineId: string): Promise<void> {
  const n = await deleteManagedLines([lineId]);
  if (n !== 1) throw new Error("Line not found");
}
