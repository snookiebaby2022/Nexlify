import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const RECOMMEND_PREFIX = "recommend:";

export type StreamRecommendation = {
  streamId: string;
  streamName: string;
  score: number;
  reason: string;
};

export async function getStreamRecommendations(
  lineId: string,
  limit: number = 10
): Promise<StreamRecommendation[]> {
  const cached = await cacheGet<StreamRecommendation[]>(`${RECOMMEND_PREFIX}${lineId}`);
  if (cached) return cached.slice(0, limit);

  // Get user's viewing history
  const history = await prisma.liveConnection.findMany({
    where: { lineId },
    select: { streamId: true },
    take: 100,
    orderBy: { startedAt: "desc" },
  });

  const streamCounts = new Map<string, number>();
  history.forEach((h) => {
    if (!h.streamId) return;
    const count = streamCounts.get(h.streamId) ?? 0;
    streamCounts.set(h.streamId, count + 1);
  });

  // Get all streams the user can access
  const line = await prisma.line.findUnique({
    where: { id: lineId },
    include: {
      bouquets: {
        include: {
          bouquet: {
            include: {
              streams: {
                include: { stream: true },
              },
            },
          },
        },
      },
    },
  });

  const accessibleStreams = new Set<string>();
  line?.bouquets.forEach((b) => {
    b.bouquet.streams.forEach((s) => {
      accessibleStreams.add(s.stream.id);
    });
  });

  // Find similar streams based on categories
  const categoryCounts = new Map<string, number>();
  history.forEach((h) => {
    const stream = line?.bouquets
      .flatMap((b) => b.bouquet.streams)
      .find((s) => s.stream.id === h.streamId);
    if (stream?.stream.categoryId) {
      const count = categoryCounts.get(stream.stream.categoryId) ?? 0;
      categoryCounts.set(stream.stream.categoryId, count + 1);
    }
  });

  // Score streams based on category popularity
  const recommendations: StreamRecommendation[] = [];
  accessibleStreams.forEach((streamId) => {
    const stream = line?.bouquets
      .flatMap((b) => b.bouquet.streams)
      .find((s) => s.stream.id === streamId);
    if (!stream) return;

    const categoryScore = categoryCounts.get(stream.stream.categoryId ?? "") ?? 0;
    const viewCount = streamCounts.get(streamId) ?? 0;
    const score = categoryScore * 2 + viewCount;

    if (score > 0) {
      recommendations.push({
        streamId: stream.stream.id,
        streamName: stream.stream.name,
        score,
        reason: `Popular in your category`,
      });
    }
  });

  recommendations.sort((a, b) => b.score - a.score);
  const result = recommendations.slice(0, limit);

  await cacheSet(`${RECOMMEND_PREFIX}${lineId}`, result, 300);
  return result;
}
