import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/lines";
import { getPanelServerSettings, getResolvedRepoPath } from "@/lib/panel-server";
import {
  DEFAULT_RELEASES_FEED_URL,
  fetchNexlifyReleasesFeed,
  isVersionNewer,
} from "@/lib/panel-releases-feed";
import { getPanelVersionInfoWithRelease } from "@/lib/panel-version";
import { panelUpdateManualSteps, runPanelRollback, runPanelUpdate } from "@/lib/panel-update";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const server = await getPanelServerSettings();
  const repoPath = getResolvedRepoPath(server);
  const version = await getPanelVersionInfoWithRelease(repoPath, server.updateCheckUrl || undefined);
  const manualSteps = panelUpdateManualSteps(repoPath);
  const canAutoUpdate = process.platform === "linux" && version.isGitRepo && !version.gitDirty;

  const feedUrl =
    process.env.NEXLIFY_RELEASES_URL?.trim() ||
    (server.updateCheckUrl?.includes("panel-releases") ? server.updateCheckUrl : "") ||
    DEFAULT_RELEASES_FEED_URL;

  let releasesFeed = null;
  let releasesFeedError: string | null = null;
  try {
    releasesFeed = await fetchNexlifyReleasesFeed(feedUrl);
  } catch (e) {
    releasesFeedError = e instanceof Error ? e.message : "Feed unavailable";
  }

  const feedUpdateAvailable =
    releasesFeed?.latestVersion != null &&
    isVersionNewer(releasesFeed.latestVersion, version.installedVersion);

  const versionOut = {
    installedVersion: version.installedVersion,
    gitBranch: version.gitBranch,
    gitCommit: version.gitCommit,
    gitDirty: version.gitDirty,
    updateAvailable: version.updateAvailable || feedUpdateAvailable,
    isGitRepo: version.isGitRepo,
    remoteError: version.remoteError,
    releasesFeed: releasesFeed
      ? { latestVersion: releasesFeed.latestVersion }
      : null,
  };

  return NextResponse.json({
    version: versionOut,
    releasesFeed,
    releasesFeedError,
    server,
    repoPath,
    platform: process.platform,
    canAutoUpdate,
    canRollback: Boolean(server.rollbackGitRef) && canAutoUpdate,
    manualSteps,
    updateHistory: server.updateHistory,
  });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = body.action === "rollback" ? "rollback" : "update";

  const result = action === "rollback" ? await runPanelRollback() : await runPanelUpdate();
  await logActivity(result.ok ? `panel_${action}_ok` : `panel_${action}_failed`, {
    meta: {
      fromVersion: result.fromVersion,
      toVersion: result.toVersion,
      message: result.message,
    },
  });

  return NextResponse.json({ result, action });
}
