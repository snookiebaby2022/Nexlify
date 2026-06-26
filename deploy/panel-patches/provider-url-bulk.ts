import { StreamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveProviderUrl } from "@/lib/vod-provider-url";

export type UrlReplaceResult = {
  matched: number;
  updated: number;
  preview?: { id: string; name: string; before: string; after: string }[];
};

export async function replaceStreamUrls(opts: {
  find: string;
  replace: string;
  streamIds?: string[];
  type?: StreamType;
  dryRun?: boolean;
}): Promise<UrlReplaceResult> {
  const where: { id?: { in: string[] }; type?: StreamType } = {};
  if (opts.streamIds?.length) where.id = { in: opts.streamIds };
  if (opts.type) where.type = opts.type;

  const streams = await prisma.stream.findMany({
    where,
    select: { id: true, name: true, streamUrl: true },
  });

  const matched = streams.filter((s) => s.streamUrl.includes(opts.find));
  const preview = matched.slice(0, 50).map((s) => ({
    id: s.id,
    name: s.name,
    before: s.streamUrl,
    after: s.streamUrl.split(opts.find).join(opts.replace),
  }));

  if (opts.dryRun) {
    return { matched: matched.length, updated: 0, preview };
  }

  let updated = 0;
  for (const s of matched) {
    await prisma.stream.update({
      where: { id: s.id },
      data: { streamUrl: s.streamUrl.split(opts.find).join(opts.replace) },
    });
    updated++;
  }

  return { matched: matched.length, updated, preview };
}

export async function cascadeProviderStreams(opts: {
  providerId: string;
  dryRun?: boolean;
}): Promise<{ matched: number; updated: number }> {
  const provider = await prisma.streamProvider.findUnique({ where: { id: opts.providerId } });
  if (!provider) throw new Error("Provider not found");

  const streams = await prisma.stream.findMany({
    where: { providerId: opts.providerId, providerPath: { not: null } },
    select: { id: true, providerPath: true, hostedExternally: true },
  });

  const toUpdate = streams.filter((s) => s.providerPath);
  if (opts.dryRun) return { matched: toUpdate.length, updated: 0 };

  let updated = 0;
  for (const s of toUpdate) {
    try {
      const streamUrl = resolveProviderUrl(provider, s.providerPath!);
      await prisma.stream.update({
        where: { id: s.id },
        data: { streamUrl, hostedExternally: s.hostedExternally },
      });
      updated++;
    } catch {
      // skip unresolvable paths
    }
  }

  return { matched: toUpdate.length, updated };
}

export async function replaceProviderBaseUrl(opts: {
  providerId: string;
  newBaseUrl: string;
  cascadeStreams?: boolean;
  dryRun?: boolean;
}): Promise<{ providerUpdated: boolean; streams: { matched: number; updated: number } }> {
  if (opts.dryRun) {
    const streams = await cascadeProviderStreams({ providerId: opts.providerId, dryRun: true });
    return { providerUpdated: false, streams };
  }

  await prisma.streamProvider.update({
    where: { id: opts.providerId },
    data: { baseUrl: opts.newBaseUrl },
  });

  const streams = opts.cascadeStreams !== false
    ? await cascadeProviderStreams({ providerId: opts.providerId })
    : { matched: 0, updated: 0 };

  return { providerUpdated: true, streams };
}
