import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";

export async function buildFullBackupSnapshot() {
  const [panelSettings, bouquets, categories, streams, lines, users, packages, coupons, epgSources] =
    await Promise.all([
      prisma.panelSetting.findMany(),
      prisma.bouquet.findMany({ include: { streams: true } }),
      prisma.category.findMany(),
      prisma.stream.findMany(),
      prisma.line.findMany({ include: { bouquets: true } }),
      prisma.panelUser.findMany({
        select: {
          id: true,
          username: true,
          role: true,
          credits: true,
          email: true,
          displayName: true,
          isActive: true,
          maxLines: true,
          groupId: true,
          parentId: true,
          resellerDns: true,
          defaultLanguage: true,
        },
      }),
      prisma.package.findMany(),
      prisma.coupon.findMany(),
      prisma.epgSource.findMany(),
    ]);

  return {
    version: 2,
    createdAt: new Date().toISOString(),
    panelSettings,
    bouquets,
    categories,
    streams,
    lines: lines.map((l) => ({
      ...l,
      password: "[redacted-export]",
    })),
    users,
    packages,
    coupons,
    epgSources,
    counts: {
      streams: streams.length,
      lines: lines.length,
      users: users.length,
      bouquets: bouquets.length,
    },
  };
}

export async function runPanelBackup() {
  const backup = await getSettingGroup("backup");
  if (!backup.enabled) return { skipped: true as const, reason: "disabled" };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshot = backup.fullExportOnBackup
    ? await buildFullBackupSnapshot()
    : {
        createdAt: new Date().toISOString(),
        panelSettings: await prisma.panelSetting.findMany(),
        counts: {
          streams: await prisma.stream.count(),
          lines: await prisma.line.count(),
          users: await prisma.panelUser.count(),
          bouquets: await prisma.bouquet.count(),
        },
      };

  const filename = `nexlify-backup-${stamp}.json`;
  const payload = JSON.stringify(snapshot, null, 2);
  const { mkdir, writeFile } = await import("fs/promises");
  const path = await import("path");
  const rawPath = String(backup.localPath ?? "").trim();
  const dir = path.resolve(
    process.cwd(),
    rawPath && !rawPath.startsWith("(") ? rawPath.replace(/^\.\//, "") : "./backups"
  );
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  await writeFile(filePath, payload, "utf8");
  return { skipped: false as const, path: filePath };
}
