import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getSettingGroup } from "@/lib/panel-settings";
import { prisma } from "@/lib/prisma";

export async function runPanelBackup() {
  const backup = await getSettingGroup("backup");
  if (!backup.enabled) return { skipped: true as const, reason: "disabled" };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshot = {
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
