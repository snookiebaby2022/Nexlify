import { getPanelServerSettings, getResolvedRepoPath } from "@/lib/panel-server";
import { getSettingGroup } from "@/lib/panel-settings";
import {
  DEFAULT_RELEASES_FEED_URL,
  fetchNexlifyReleasesFeed,
  isVersionNewer,
} from "@/lib/panel-releases-feed";
import { getPanelVersionInfoWithRelease, readInstalledVersion } from "@/lib/panel-version";
import {
  isJobRunning,
  reconcileStaleUpdateJob,
  startBackgroundPanelUpdate,
} from "@/lib/panel-update-job";
import { resolvePatchUpdateScript } from "@/lib/panel-update";

export type PanelUpdateStatus = {
  installedVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  autoApplyEnabled: boolean;
  canAutoUpdate: boolean;
  updateRunning: boolean;
  repoPath: string;
};

export async function getPanelUpdateStatus(): Promise<PanelUpdateStatus> {
  const server = await getPanelServerSettings();
  const repoPath = getResolvedRepoPath(server);
  const version = await getPanelVersionInfoWithRelease(repoPath, server.updateCheckUrl || undefined);
  const settings = await getSettingGroup("server");

  let latestVersion: string | null = null;
  try {
    const feed = await fetchNexlifyReleasesFeed(
      process.env.NEXLIFY_RELEASES_URL?.trim() || DEFAULT_RELEASES_FEED_URL
    );
    latestVersion = feed.latestVersion;
  } catch {
    latestVersion = null;
  }

  const updateAvailable =
    latestVersion != null && isVersionNewer(latestVersion, version.installedVersion);
  const job = await reconcileStaleUpdateJob(repoPath);
  const patchScript = await resolvePatchUpdateScript(repoPath);

  return {
    installedVersion: version.installedVersion,
    latestVersion,
    updateAvailable,
    autoApplyEnabled: settings.panelUpdateAutoDownload === true,
    canAutoUpdate:
      process.platform === "linux" && (version.isGitRepo || patchScript != null),
    updateRunning: isJobRunning(job),
    repoPath,
  };
}

/** Start a background update when auto-apply is on and a newer release exists. */
export async function maybeAutoApplyPanelUpdate(): Promise<{
  started: boolean;
  reason: string;
}> {
  const status = await getPanelUpdateStatus();

  if (!status.autoApplyEnabled) return { started: false, reason: "auto_disabled" };
  if (!status.canAutoUpdate) return { started: false, reason: "cannot_auto_update" };
  if (status.updateRunning) return { started: false, reason: "already_running" };
  if (!status.latestVersion || !isVersionNewer(status.latestVersion, status.installedVersion)) {
    return { started: false, reason: "already_latest" };
  }

  const { version: fromVersion } = await readInstalledVersion(status.repoPath);
  const result = await startBackgroundPanelUpdate(status.repoPath, fromVersion);
  if (!result.ok) return { started: false, reason: result.error ?? "start_failed" };
  return { started: true, reason: "started" };
}
