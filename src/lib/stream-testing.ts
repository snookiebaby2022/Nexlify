import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const TEST_PREFIX = "stream:test:";

export type StreamTestResult = {
  streamId: string;
  streamName: string;
  sourceUrl: string;
  accessible: boolean;
  latencyMs: number;
  bitrateKbps: number;
  resolution: string;
  codec: string;
  bufferingEvents: number;
  score: number; // 0-100
  errors: string[];
  testedAt: number;
};

export async function testStreamSource(url: string): Promise<{
  accessible: boolean;
  latencyMs: number;
  errors: string[];
}> {
  const start = Date.now();
  const errors: string[] = [];

  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Nexlify-StreamTest/1.0" },
    });

    const latencyMs = Date.now() - start;
    const accessible = res.ok;

    if (!accessible) {
      errors.push(`HTTP ${res.status}: ${res.statusText}`);
    }

    return { accessible, latencyMs, errors };
  } catch (err) {
    return {
      accessible: false,
      latencyMs: Date.now() - start,
      errors: [err instanceof Error ? err.message : "Connection failed"],
    };
  }
}

export async function testStream(streamId: string): Promise<StreamTestResult> {
  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    select: { id: true, name: true, streamUrl: true, type: true },
  });

  if (!stream) {
    return {
      streamId,
      streamName: "",
      sourceUrl: "",
      accessible: false,
      latencyMs: 0,
      bitrateKbps: 0,
      resolution: "",
      codec: "",
      bufferingEvents: 0,
      score: 0,
      errors: ["Stream not found"],
      testedAt: Date.now(),
    };
  }

  const { probeStreamUrl } = await import("@/lib/stream-probe-server");
  const probe = await probeStreamUrl(stream.streamUrl, { fast: true });
  const accessible = probe.status === "online" || probe.status === "degraded";
  const test = {
    accessible,
    latencyMs: probe.latencyMs ?? 0,
    errors: accessible ? [] : [probe.message],
  };
  
  // Calculate score
  let score = 100;
  if (!test.accessible) score = 0;
  else {
    if (test.latencyMs > 5000) score -= 30;
    else if (test.latencyMs > 2000) score -= 15;
    if (test.errors.length > 0) score -= 20;
  }

  const result: StreamTestResult = {
    streamId: stream.id,
    streamName: stream.name,
    sourceUrl: stream.streamUrl,
    accessible: test.accessible,
    latencyMs: test.latencyMs,
    bitrateKbps: probe.bitrateKbps ?? 0,
    resolution: probe.resolution ?? "",
    codec: probe.videoCodec ?? "",
    bufferingEvents: 0,
    score: Math.max(0, score),
    errors: test.errors,
    testedAt: Date.now(),
  };

  // Cache result
  await cacheSet(`${TEST_PREFIX}${streamId}`, result, 300);

  // Update stream health in DB
  await prisma.stream.update({
    where: { id: streamId },
    data: { lastProbeOk: test.accessible },
  });

  return result;
}

export async function testAllStreams(): Promise<{
  total: number;
  accessible: number;
  failed: number;
  results: StreamTestResult[];
}> {
  const streams = await prisma.stream.findMany({
    where: { isActive: true, type: "LIVE" },
    select: { id: true },
    take: 100,
  });

  const results: StreamTestResult[] = [];
  for (const stream of streams) {
    const result = await testStream(stream.id);
    results.push(result);
  }

  return {
    total: results.length,
    accessible: results.filter(r => r.accessible).length,
    failed: results.filter(r => !r.accessible).length,
    results,
  };
}

export async function getStreamTestResult(streamId: string): Promise<StreamTestResult | null> {
  return cacheGet<StreamTestResult>(`${TEST_PREFIX}${streamId}`);
}

export async function getFailedStreams(): Promise<StreamTestResult[]> {
  const streams = await prisma.stream.findMany({
    where: { isActive: true, type: "LIVE", lastProbeOk: false },
    select: { id: true, name: true },
    take: 50,
  });

  const results: StreamTestResult[] = [];
  for (const stream of streams) {
    const cached = await getStreamTestResult(stream.id);
    if (cached) results.push(cached);
  }

  return results;
}
