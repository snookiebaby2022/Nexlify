import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function getResellerBouquetIds(session: {
  role: PanelRole;
  id: string;
}): Promise<string[] | null> {
  if (session.role === PanelRole.ADMIN) return null;
  const rows = await prisma.resellerBouquet.findMany({
    where: { userId: session.id },
    select: { bouquetId: true },
  });
  return rows.map((r) => r.bouquetId);
}
