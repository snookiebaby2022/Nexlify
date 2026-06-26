import { prisma } from "@/lib/prisma";

const PLUGIN_BOUQUET_NAME = "Plugin imports";

export async function ensurePluginImportBouquetId(): Promise<string> {
  const existing = await prisma.bouquet.findFirst({
    where: { name: PLUGIN_BOUQUET_NAME },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.bouquet.create({
    data: { name: PLUGIN_BOUQUET_NAME, isActive: true, sortOrder: 9000 },
    select: { id: true },
  });
  return created.id;
}

export async function linkStreamToPluginBouquet(streamId: string, sortOrder = 9000) {
  const bouquetId = await ensurePluginImportBouquetId();
  await prisma.bouquetStream.upsert({
    where: { bouquetId_streamId: { bouquetId, streamId } },
    create: { bouquetId, streamId, sortOrder },
    update: { sortOrder },
  });
}

/** Attach plugin bouquet to all active lines so synced content is playable immediately. */
export async function attachPluginBouquetToAllLines() {
  const bouquetId = await ensurePluginImportBouquetId();
  const lines = await prisma.line.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });
  for (const line of lines) {
    await prisma.lineBouquet.upsert({
      where: { lineId_bouquetId: { lineId: line.id, bouquetId } },
      create: { lineId: line.id, bouquetId },
      update: {},
    });
  }
}
