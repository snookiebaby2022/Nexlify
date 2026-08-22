import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function canAccessBouquet(
  session: { role: PanelRole; id: string },
  bouquetId: string
): Promise<boolean> {
  if (session.role === PanelRole.ADMIN) return true;
  const link = await prisma.resellerBouquet.findFirst({
    where: { bouquetId, userId: session.id },
    select: { bouquetId: true },
  });
  return !!link;
}

/** Resellers may edit/delete bouquets they own; admins may edit all. */
export async function canManageBouquet(
  session: { role: PanelRole; id: string },
  bouquetId: string
): Promise<boolean> {
  if (session.role === PanelRole.ADMIN) return true;
  const bouquet = await prisma.bouquet.findUnique({
    where: { id: bouquetId },
    select: { ownerUserId: true },
  });
  if (!bouquet?.ownerUserId) return false;
  return bouquet.ownerUserId === session.id;
}
