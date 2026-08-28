import { prisma } from "@/lib/prisma";
import {
  listStreamPlaybackUrls,
  type StreamWithProvider,
} from "@/lib/resolve-stream-url";

const MAX_CHAIN_DEPTH = 4;

/** Walk parentStreamId chain and collect backup URLs (XUI 3+ source failover). */
export async function listStreamPlaybackUrlsWithChain(
  stream: StreamWithProvider,
  seed?: string
): Promise<string[]> {
  const out: string[] = [];
  const addAll = (urls: string[]) => {
    for (const u of urls) {
      if (u && !out.includes(u)) out.push(u);
    }
  };

  addAll(listStreamPlaybackUrls(stream, seed));

  let parentId = stream.parentStreamId;
  let depth = 0;
  const seen = new Set<string>([stream.id]);

  while (parentId && depth < MAX_CHAIN_DEPTH && !seen.has(parentId)) {
    seen.add(parentId);
    depth++;
    const parent = await prisma.stream.findUnique({
      where: { id: parentId },
      include: { provider: true, server: true },
    });
    if (!parent) break;
    addAll(listStreamPlaybackUrls(parent as StreamWithProvider, `${seed ?? ""}:p${depth}`));
    parentId = parent.parentStreamId;
  }

  return out;
}
