import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";

export async function listWatchFoldersPage() {
  const [folders, vod] = await Promise.all([
    prisma.watchFolder.findMany({ orderBy: { name: "asc" } }),
    getSettingGroup("vod-storage"),
  ]);
  return {
    folders: folders.map((f) => ({
      ...f,
      lastScan: f.lastScan?.toISOString() ?? null,
    })),
    vodStorage: {
      rcloneRemote: String(vod.rcloneRemote ?? ""),
      rclonePath: String(vod.rclonePath ?? ""),
      localMountPath: String(vod.localMountPath ?? ""),
      s3Bucket: String(vod.s3Bucket ?? ""),
    },
  };
}
