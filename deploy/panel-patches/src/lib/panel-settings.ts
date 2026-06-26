import { prisma } from "@/lib/prisma";

export const SETTING_GROUPS = [
  "general",
  "community",
  "streams",
  "cache",
  "backup",
  "tmdb",
  "notifications",
  "security",
  "fingerprint",
  "binaries",
  "domains",
  "server",
  "geo",
  "theft",
  "integrations",
  "player",
] as const;

export type SettingGroup = (typeof SETTING_GROUPS)[number];

const DEFAULTS: Record<SettingGroup, Record<string, unknown>> = {
  general: {
    panelName: "Nexlify",
    panelUrl: "",
    timezone: "UTC",
    defaultLanguage: "en",
    maintenanceMode: false,
    disableTrial: false,
  },
  community: {
    telegramUrl: "",
    discordUrl: "",
    signalUrl: "",
  },
  server: {
    serverUrl: "",
    magServerUrl: "",
    enigmaServerUrl: "",
    panelPort: 3000,
    panelSslPort: 443,
    streamHttpPort: 8080,
    streamHttpsPort: 443,
    repoPath: "",
    lastPanelUpdate: null as {
      at: string;
      ok: boolean;
      message: string;
      fromVersion: string;
      toVersion: string;
    } | null,
    updateHistory: [] as {
      at: string;
      ok: boolean;
      message: string;
      fromVersion: string;
      toVersion: string;
      action: "update" | "rollback";
      steps?: { name: string; ok: boolean; output: string }[];
    }[],
    rollbackGitRef: null as string | null,
    updateCheckUrl: "",
    panelUpdateAutoDownload: true,
  },
  streams: {
    defaultStreamTimeout: 30,
    maxConnectionsPerLine: 1,
    allowRestream: false,
    epgHoursAhead: 48,
    vodDirectPlay: true,
    excludeDisabledFromExport: true,
    connectionLimitHandle: "validate_on_connect",
    vodConnectionHandle: "30m_expire",
    loadBalancing: "server_slots",
    loadBalancingRestriction: "stop_overloaded",
    streamConnectionsOnRestart: "keep",
    nginxBufferLive: false,
    nginxBufferVod: false,
    nginxRestreamUseBuffer: false,
    nginxBufferCountLive: 96,
    nginxBufferCountVod: 96,
    nginxBufferSizeLive: "32k",
    nginxBufferSizeVod: "32k",
    hlsSegmentDuration: 6,
    segmentLength: 10,
    bufferSize: "512k",
    readTimeout: 30,
    connectionTimeout: 10,
    maxConnectionsPerStream: 0,
    ffmpegThreadCount: 0,
    transcodePreset: "veryfast",
    antiBufferNotes: "",
    antiFreezeEnabled: true,
    fastZapEnabled: true,
    playbackUrlCacheTtlSec: 60,
    zapPrefetchNeighbors: 3,
    zapPrefetchOnLiveHit: true,
    zapPrefetchOnPlaylist: false,
    autoChannelLogos: true,
    autoChannelLogoSource: "tmdb_then_slug",
  },
  cache: {
    statsTtlSeconds: 60,
    epgTtlSeconds: 300,
    categoriesTtlSeconds: 120,
    redisMode: "single",
    redisClusterNodes: "",
    notes: "",
  },
  backup: {
    enabled: true,
    scheduleCron: "0 3 * * *",
    target: "local",
    localPath: "",
    remoteProtocol: "sftp",
    remoteHost: "",
    remotePort: 22,
    remoteUser: "",
    remotePassword: "",
    remotePath: "/backups/nexlify",
    keepDays: 7,
  },
  tmdb: {
    apiKey: "",
    language: "en-US",
    enableMovieMeta: true,
    enableSeriesMeta: true,
  },
  notifications: {
    emailEnabled: false,
    notifyEmail: "",
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPassword: "",
    notifyNewLine: true,
    notifyLowCredits: true,
    notifyTicketReply: true,
  },
  security: {
    forceHttps: false,
    sessionDays: 7,
    ipWhitelist: "",
    logoutOnIpChange: false,
    maxLoginAttempts: 10,
    lockoutMinutes: 15,
    loginFloodPerMin: 30,
    requireStrongPasswords: false,
    autoGenerateLineCredentials: true,
    lineCredentialMinLength: 6,
    apiRateLimitPerMin: 120,
    totpRequiredForAdmins: false,
    blockBots: true,
    stealthPanel: true,
    trustCloudflareIp: true,
    trustBunnyIp: true,
    cloudflareIpv4: "",
    cloudflareIpv6: "",
    bunnyIpv4: "",
    cdnIpsSyncedAt: null as string | null,
  },
  fingerprint: {
    enabled: false,
    algorithm: "sha256",
    includeUserAgent: true,
    includeClientIp: true,
    secret: "",
  },
  domains: {
    primaryDomain: "",
    extraDomains: [] as string[],
    sslEnabled: false,
    forceHttps: false,
    fullSslEncryption: false,
    certbotEmail: "",
    certFullChainPath: "",
    certKeyPath: "",
    lastCertbotRun: null as {
      at: string;
      ok: boolean;
      message: string;
      domains: string[];
    } | null,
  },
  binaries: {
    binRoot: "/home/nexlify/bin",
    nginxPath: "/home/nexlify/bin/nginx/sbin/nginx",
    nginxRtmpPath: "/home/nexlify/bin/nginx_rtmp/sbin/nginx",
    ffmpegPath: "/home/nexlify/bin/ffmpeg_bin/ffmpeg",
    redisPath: "/home/nexlify/bin/redis/bin/redis-server",
    phpPath: "/home/nexlify/bin/php/bin/php",
    certbotPath: "/home/nexlify/bin/certbot/bin/certbot",
    maxmindPath: "/home/nexlify/bin/maxmind",
    daemonsSh: "/home/nexlify/bin/daemons.sh",
    useBundledOnStreamServers: true,
    activeFfmpegId: "bundled-74",
    activePhpId: "php84",
    ffmpegVersions: [] as { id: string; label: string; path: string }[],
    phpVersions: [] as { id: string; label: string; path: string }[],
    notes: "",
  },
  geo: {
    enabled: true,
    maxmindDbPath: "",
    blockVpnHosting: false,
    fallbackIpApi: true,
  },
  theft: {
    enabled: true,
    sameIpLineThreshold: 3,
    autoDisableLine: false,
    lookbackMinutes: 10,
    vodTheftEnabled: true,
    vodSameIpLineThreshold: 2,
    streamTheftEnabled: true,
    streamSameIpLineThreshold: 3,
  },
  integrations: {
    plexDefaultPort: 32400,
    youtubeImportAsLive: true,
  },
  player: {
    builtInCdm: true,
    widevineEnabled: true,
    playreadyEnabled: false,
    licenseProxyUrl: "",
    cdmNotes: "Built-in Widevine CDM for the panel player and stream probe.",
  },
};

function settingKey(group: SettingGroup) {
  return `settings.${group}`;
}

export async function getSettingGroup(group: SettingGroup): Promise<Record<string, unknown>> {
  const row = await prisma.panelSetting.findUnique({ where: { key: settingKey(group) } });
  const base = { ...DEFAULTS[group] };
  if (!row?.value) return base;
  try {
    return { ...base, ...(JSON.parse(row.value) as Record<string, unknown>) };
  } catch {
    return base;
  }
}

export async function setSettingGroup(group: SettingGroup, data: Record<string, unknown>) {
  const merged = { ...DEFAULTS[group], ...data };
  await prisma.panelSetting.upsert({
    where: { key: settingKey(group) },
    create: { key: settingKey(group), value: JSON.stringify(merged) },
    update: { value: JSON.stringify(merged) },
  });
  return merged;
}

export async function getAllSettings() {
  const out: Record<string, Record<string, unknown>> = {};
  for (const g of SETTING_GROUPS) {
    out[g] = await getSettingGroup(g);
  }
  return out;
}

/** Community links (migrated from general when community group is empty). */
export async function getCommunityLinksSettings(): Promise<{
  telegramUrl: string;
  discordUrl: string;
  signalUrl: string;
}> {
  const community = await getSettingGroup("community");
  const general = await getSettingGroup("general");
  return {
    telegramUrl: String(community.telegramUrl ?? general.telegramUrl ?? ""),
    discordUrl: String(community.discordUrl ?? general.discordUrl ?? ""),
    signalUrl: String(community.signalUrl ?? general.signalUrl ?? ""),
  };
}
