import { getSession } from "@/lib/auth";
import { listWatchFoldersPage } from "@/lib/watch-folders-list";
import { AdminWatchFoldersClient } from "./watch-folders-client";

function vodHintFromStorage(vod: {
  localMountPath?: string;
  rcloneRemote?: string;
  rclonePath?: string;
}): string {
  if (vod.localMountPath) return `rclone/S3 mount: ${vod.localMountPath}`;
  if (vod.rcloneRemote) {
    return `rclone remote ${vod.rcloneRemote}${vod.rclonePath || ""} — mount it locally then add that path here.`;
  }
  return "";
}

export default async function AdminWatchFoldersPage() {
  const session = await getSession();
  if (!session) return null;

  const { folders, vodStorage } = await listWatchFoldersPage();

  return (
    <AdminWatchFoldersClient
      initialFolders={folders}
      initialVodHint={vodHintFromStorage(vodStorage)}
    />
  );
}
