import { prisma } from "@/lib/prisma";

/** Increment when backup JSON shape changes. */
export const BACKUP_VERSION = 4;

export const BACKUP_MANIFEST = [
  "panelSettings",
  "categories",
  "streamProxies",
  "vpnProfiles",
  "streamServers",
  "streamProviders",
  "userGroups",
  "users",
  "packages",
  "coupons",
  "epgSources",
  "streams",
  "bouquets",
  "lines",
  "magDevices",
  "enigmaDevices",
  "watchFolders",
  "m3uSyncJobs",
  "blockedAsns",
  "blockedUserAgents",
  "accessCodes",
  "mediaIntegrations",
] as const;

export type BackupSideTables = {
  streamProxies: Awaited<ReturnType<typeof prisma.streamProxy.findMany>>;
  vpnProfiles: Awaited<ReturnType<typeof prisma.vpnProfile.findMany>>;
  streamServers: Awaited<ReturnType<typeof prisma.streamServer.findMany>>;
  streamProviders: Awaited<ReturnType<typeof prisma.streamProvider.findMany>>;
  userGroups: Awaited<ReturnType<typeof prisma.userGroup.findMany>>;
  magDevices: Awaited<ReturnType<typeof prisma.magDevice.findMany>>;
  enigmaDevices: Awaited<ReturnType<typeof prisma.enigmaDevice.findMany>>;
  watchFolders: Awaited<ReturnType<typeof prisma.watchFolder.findMany>>;
  m3uSyncJobs: Awaited<ReturnType<typeof prisma.m3uSyncJob.findMany>>;
  blockedAsns: Awaited<ReturnType<typeof prisma.blockedAsn.findMany>>;
  blockedUserAgents: Awaited<ReturnType<typeof prisma.blockedUserAgent.findMany>>;
  accessCodes: Awaited<ReturnType<typeof prisma.accessCode.findMany>>;
  mediaIntegrations: Awaited<ReturnType<typeof prisma.mediaIntegration.findMany>>;
};

export async function loadBackupSideTables(): Promise<BackupSideTables> {
  const [
    streamProxies,
    vpnProfiles,
    streamServers,
    streamProviders,
    userGroups,
    magDevices,
    enigmaDevices,
    watchFolders,
    m3uSyncJobs,
    blockedAsns,
    blockedUserAgents,
    accessCodes,
    mediaIntegrations,
  ] = await Promise.all([
    prisma.streamProxy.findMany(),
    prisma.vpnProfile.findMany(),
    prisma.streamServer.findMany(),
    prisma.streamProvider.findMany(),
    prisma.userGroup.findMany(),
    prisma.magDevice.findMany(),
    prisma.enigmaDevice.findMany(),
    prisma.watchFolder.findMany(),
    prisma.m3uSyncJob.findMany(),
    prisma.blockedAsn.findMany(),
    prisma.blockedUserAgent.findMany(),
    prisma.accessCode.findMany(),
    prisma.mediaIntegration.findMany(),
  ]);
  return {
    streamProxies,
    vpnProfiles,
    streamServers,
    streamProviders,
    userGroups,
    magDevices,
    enigmaDevices,
    watchFolders,
    m3uSyncJobs,
    blockedAsns,
    blockedUserAgents,
    accessCodes,
    mediaIntegrations,
  };
}

type PanelUserRow = Awaited<ReturnType<typeof prisma.panelUser.findMany>>[number];

/** Panel logins + API keys; redact when `includeSecrets` is false. */
export async function loadBackupPanelUsers(includeSecrets: boolean): Promise<PanelUserRow[]> {
  const rows = await prisma.panelUser.findMany();
  if (includeSecrets) return rows;
  return rows.map((u) => ({
    ...u,
    passwordHash: "[redacted-export]",
    passwordPlain: null,
    totpSecret: null,
    apiKey: null,
  }));
}

export function backupIncludesSecrets(snapshot: Record<string, unknown>): boolean {
  const lines = snapshot.lines;
  if (Array.isArray(lines) && lines.some((l) => (l as { password?: string }).password === "[redacted-export]")) {
    return false;
  }
  const users = snapshot.users;
  if (
    Array.isArray(users) &&
    users.some((u) => (u as { passwordHash?: string }).passwordHash === "[redacted-export]")
  ) {
    return false;
  }
  return true;
}
