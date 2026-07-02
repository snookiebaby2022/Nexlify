import { prisma } from "@/lib/prisma";
import { PANEL_CATEGORY_NAME } from "@/lib/server-ports";

/** Ensures a stream category exists for panel port grouping. */
export async function ensurePanelCategory(): Promise<void> {
  const existing = await prisma.category.findFirst({
    where: { name: PANEL_CATEGORY_NAME },
  });
  if (existing) return;
  await prisma.category.create({
    data: { name: PANEL_CATEGORY_NAME, sortOrder: 0 },
  });
}
