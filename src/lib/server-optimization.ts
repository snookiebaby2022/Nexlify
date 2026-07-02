import { Prisma } from "@prisma/client";
import os from "os";
import { prisma } from "@/lib/prisma";
import { getSettingGroup, setSettingGroup } from "@/lib/panel-settings";
import { parseServerPanelSettings } from "@/lib/server-panel-settings";
import { bumpConfigRevision } from "@/lib/stream-agent";
import { redisModeFromEnv, redisPing } from "@/lib/redis";

export type HardwareTier = "small_vps" | "medium_vps" | "large_vps" | "dedicated";

export type HostHardwareProfile = {
  tier: HardwareTier;
  label: string;
  cpuCores: number;
  ramGb: number;
  hostname: string;
};

export type OptimizationProfile = {
  tier: HardwareTier;
  label: string;
  streams: Record<string, unknown>;
  cache: Record<string, unknown>;
  serverPerformance: {
    cpuThreads: number;
    maxConnections: number;
    bufferSizeMb: number;
    ioReadMbps: number;
    ioWriteMbps: number;
  };
  notes: string[];
};

export function detectHostHardware(): HostHardwareProfile {
  const cpuCores = os.cpus().length || 1;
  const ramGb = Math.round(os.totalmem() / 1024 ** 3);
  const tier = classifyTier(cpuCores, ramGb);
  return {
    tier,
    label: tierLabel(tier),
    cpuCores,
    ramGb,
    hostname: os.hostname(),
  };
}

function classifyTier(cpuCores: number, ramGb: number): HardwareTier {
  if (cpuCores >= 16 && ramGb >= 32) return "dedicated";
  if (cpuCores >= 8 && ramGb >= 16) return "large_vps";
  if (cpuCores >= 4 && ramGb >= 8) return "medium_vps";
  return "small_vps";
}

function tierLabel(tier: HardwareTier): string {
  switch (tier) {
    case "dedicated":
      return "Dedicated / high-capacity";
    case "large_vps":
      return "Large VPS";
    case "medium_vps":
      return "Medium VPS";
    default:
      return "Small VPS";
  }
}

export function buildOptimizationProfile(hardware: HostHardwareProfile): OptimizationProfile {
  const { tier, cpuCores, ramGb } = hardware;
  const threads = Math.max(1, Math.min(cpuCores - 1, cpuCores <= 2 ? 1 : cpuCores <= 4 ? 2 : cpuCores <= 8 ? 4 : 8));

  const base = {
    antiFreezeEnabled: true,
    fastZapEnabled: true,
    zapPrefetchOnLiveHit: true,
    nginxBufferLive: false,
    transcodePreset: "veryfast" as const,
  };

  switch (tier) {
    case "dedicated":
      return {
        tier,
        label: hardware.label,
        streams: {
          ...base,
          ffmpegThreadCount: threads,
          maxConnectionsPerStream: 0,
          playbackUrlCacheTtlSec: 90,
          zapPrefetchNeighbors: 5,
          zapPrefetchOnPlaylist: true,
          hlsSegmentDuration: 4,
          bufferSize: "1m",
          readTimeout: 45,
          connectionTimeout: 15,
        },
        cache: {
          playbackUrlCacheTtlSec: 60,
          statsTtlSeconds: 10,
          epgTtlSeconds: 180,
          redisMaxMemory: "512mb",
        },
        serverPerformance: {
          cpuThreads: threads,
          maxConnections: 5000,
          bufferSizeMb: 128,
          ioReadMbps: 0,
          ioWriteMbps: 0,
        },
        notes: [
          `Detected ${cpuCores} CPU cores, ${ramGb} GB RAM — dedicated profile`,
          "Anti-Freeze ON, Fast Zap ON, neighbour prefetch ×5",
          "Higher cache TTL and playlist warm for large bouquets",
        ],
      };
    case "large_vps":
      return {
        tier,
        label: hardware.label,
        streams: {
          ...base,
          ffmpegThreadCount: threads,
          playbackUrlCacheTtlSec: 75,
          zapPrefetchNeighbors: 4,
          zapPrefetchOnPlaylist: false,
          hlsSegmentDuration: 4,
          bufferSize: "768k",
          readTimeout: 35,
        },
        cache: {
          playbackUrlCacheTtlSec: 45,
          statsTtlSeconds: 12,
          epgTtlSeconds: 120,
          redisMaxMemory: "384mb",
        },
        serverPerformance: {
          cpuThreads: threads,
          maxConnections: 2500,
          bufferSizeMb: 96,
          ioReadMbps: 0,
          ioWriteMbps: 0,
        },
        notes: [
          `Detected ${cpuCores} CPU cores, ${ramGb} GB RAM — large VPS profile`,
          "Balanced anti-freeze + prefetch for 500–2000 lines",
        ],
      };
    case "medium_vps":
      return {
        tier,
        label: hardware.label,
        streams: {
          ...base,
          ffmpegThreadCount: threads,
          playbackUrlCacheTtlSec: 60,
          zapPrefetchNeighbors: 3,
          hlsSegmentDuration: 4,
          bufferSize: "512k",
        },
        cache: {
          playbackUrlCacheTtlSec: 30,
          statsTtlSeconds: 15,
          epgTtlSeconds: 120,
          redisMaxMemory: "256mb",
        },
        serverPerformance: {
          cpuThreads: threads,
          maxConnections: 1200,
          bufferSizeMb: 64,
          ioReadMbps: 0,
          ioWriteMbps: 0,
        },
        notes: [
          `Detected ${cpuCores} CPU cores, ${ramGb} GB RAM — medium VPS profile`,
          "Recommended for 100–800 concurrent viewers",
        ],
      };
    default:
      return {
        tier,
        label: hardware.label,
        streams: {
          ...base,
          ffmpegThreadCount: threads,
          playbackUrlCacheTtlSec: 45,
          zapPrefetchNeighbors: 2,
          hlsSegmentDuration: 4,
          bufferSize: "256k",
          readTimeout: 25,
          maxConnectionsPerStream: 200,
        },
        cache: {
          playbackUrlCacheTtlSec: 25,
          statsTtlSeconds: 20,
          epgTtlSeconds: 90,
          redisMaxMemory: "128mb",
        },
        serverPerformance: {
          cpuThreads: threads,
          maxConnections: 400,
          bufferSizeMb: 32,
          ioReadMbps: 0,
          ioWriteMbps: 0,
        },
        notes: [
          `Detected ${cpuCores} CPU cores, ${ramGb} GB RAM — small VPS profile`,
          "Conservative prefetch to protect CPU/RAM on budget VPS",
        ],
      };
  }
}

export async function getOptimizationStatus() {
  const hardware = detectHostHardware();
  const profile = buildOptimizationProfile(hardware);
  const [streamsSettings, cacheSettings, redisOk] = await Promise.all([
    getSettingGroup("streams"),
    getSettingGroup("cache"),
    redisPing(),
  ]);

  return {
    hardware,
    recommended: profile,
    current: {
      antiFreezeEnabled: streamsSettings.antiFreezeEnabled !== false,
      fastZapEnabled: streamsSettings.fastZapEnabled !== false,
      zapPrefetchNeighbors: Number(streamsSettings.zapPrefetchNeighbors ?? 3),
      zapPrefetchOnLiveHit: streamsSettings.zapPrefetchOnLiveHit !== false,
      playbackUrlCacheTtlSec: Number(streamsSettings.playbackUrlCacheTtlSec ?? 60),
      ffmpegThreadCount: Number(streamsSettings.ffmpegThreadCount ?? 0),
    },
    redis: {
      connected: redisOk,
      mode: redisModeFromEnv(),
      urlSet: Boolean(process.env.REDIS_URL?.trim() || process.env.REDIS_CLUSTER_NODES?.trim()),
    },
    cachePlaybackTtl: Number(cacheSettings.playbackUrlCacheTtlSec ?? 30),
  };
}

export async function applyOptimizationProfile(opts?: { pushAgents?: boolean }) {
  const hardware = detectHostHardware();
  const profile = buildOptimizationProfile(hardware);
  const steps: string[] = [];

  const [streamsBefore, cacheBefore] = await Promise.all([
    getSettingGroup("streams"),
    getSettingGroup("cache"),
  ]);

  await setSettingGroup("streams", { ...streamsBefore, ...profile.streams });
  steps.push(`Streams tuned for ${profile.label}`);

  await setSettingGroup("cache", { ...cacheBefore, ...profile.cache });
  steps.push("Cache TTLs aligned with Fast Zap");

  const servers = await prisma.streamServer.findMany({
    where: { isActive: true },
    select: { id: true, panelSettings: true, maxClients: true },
  });

  for (const server of servers) {
    const parsed = parseServerPanelSettings(server.panelSettings);
    const perf = {
      ...parsed.performance,
      cpuThreads: profile.serverPerformance.cpuThreads,
      maxConnections: profile.serverPerformance.maxConnections,
      bufferSizeMb: profile.serverPerformance.bufferSizeMb,
    };
    await prisma.streamServer.update({
      where: { id: server.id },
      data: {
        maxClients: profile.serverPerformance.maxConnections,
        panelSettings: {
          ...parsed.rest,
          network: parsed.network,
          performance: perf,
          advanced: parsed.advanced,
          ssl: parsed.ssl,
        } as Prisma.InputJsonValue,
      },
    });
    if (opts?.pushAgents !== false && server.id) {
      await bumpConfigRevision(server.id);
    }
  }

  if (servers.length) {
    steps.push(`Updated ${servers.length} server(s) + pushed agent config`);
  } else {
    steps.push("No streaming servers — panel settings saved only");
  }

  return { hardware, profile, steps };
}
