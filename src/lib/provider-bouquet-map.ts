import { prisma } from "@/lib/prisma";

export type ProviderBouquetMap = Record<string, string>;

export function parseProviderBouquetMap(raw: unknown): ProviderBouquetMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ProviderBouquetMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(k).trim();
    const val = String(v ?? "").trim();
    if (key && val) out[key] = val;
  }
  return out;
}

/** Resolve local bouquet id for an upstream Xtream category_id. */
export function resolveMappedBouquetId(
  map: ProviderBouquetMap,
  upstreamCategoryId: string | null | undefined
): string | null {
  if (!upstreamCategoryId) return null;
  return map[String(upstreamCategoryId).trim()] ?? null;
}

/** After provider sync, assign new streams to mapped bouquets. */
export async function applyProviderBouquetMap(
  providerId: string,
  importedStreamIds: string[],
  upstreamCategoryByStreamId: Map<string, string>
): Promise<number> {
  if (!importedStreamIds.length) return 0;
  const provider = await prisma.streamProvider.findUnique({
    where: { id: providerId },
    select: { bouquetCategoryMap: true },
  });
  const map = parseProviderBouquetMap(provider?.bouquetCategoryMap);
  if (!Object.keys(map).length) return 0;

  let assigned = 0;
  for (const streamId of importedStreamIds) {
    const catId = upstreamCategoryByStreamId.get(streamId);
    const bouquetId = resolveMappedBouquetId(map, catId);
    if (!bouquetId) continue;
    const exists = await prisma.bouquetStream.findFirst({
      where: { bouquetId, streamId },
    });
    if (exists) continue;
    await prisma.bouquetStream.create({
      data: { bouquetId, streamId, sortOrder: 0 },
    });
    assigned++;
  }
  return assigned;
}
