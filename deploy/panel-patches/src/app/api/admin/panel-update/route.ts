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
import {
  clearUpdateJob,
  isJobRunning,
  readUpdateJob,
  reconcileStaleUpdateJob,
  startBackgroundPanelUpdate,
} from "@/lib/panel-update-job";
import {
  panelUpdateManualSteps,
  resolvePatchUpdateScript,
  runPanelRollback,
  runPanelUpdate,
} from "@/lib/panel-update";
import { readInstalledVersion } from "@/lib/panel-version";
import { PanelRole } from "@prisma/client";

export async function GET() {
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const server = await getPanelServerSettings();
    const repoPath = getResolvedRepoPath(server);
    const version = await getPanelVersionInfoWithRelease(repoPath, server.updateCheckUrl || undefined);
    const manualSteps = panelUpdateManualSteps(repoPath);
    const patchScript = await resolvePatchUpdateScript(repoPath);
    const canAutoUpdate =
      process.platform === "linux" && (Boolean(patchScript) || version.isGitRepo);

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
      updateAvailable: feedUpdateAvailable || version.updateAvailable,
      isGitRepo: version.isGitRepo,
      remoteError: version.remoteError,
      releasesFeed: releasesFeed
        ? { latestVersion: releasesFeed.latestVersion }
        : null,
    };

    const job = await reconcileStaleUpdateJob(repoPath);

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
      job,
      updateRunning: isJobRunning(job),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Panel update check failed";
    console.error("[panel-update] GET failed:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action =
    body.action === "rollback"
      ? "rollback"
      : body.action === "start"
        ? "start"
        : body.action === "cancel"
          ? "cancel"
          : "update";

  if (action === "cancel") {
    const server = await getPanelServerSettings();
    const repoPath = getResolvedRepoPath(server);
    await reconcileStaleUpdateJob(repoPath);
    await clearUpdateJob(repoPath);
    return NextResponse.json({ cancelled: true, job: await readUpdateJob(repoPath) });
  }

  if (action === "start") {
    const server = await getPanelServerSettings();
    const repoPath = getResolvedRepoPath(server);
    const { version: fromVersion } = await readInstalledVersion(repoPath);

    if (process.platform !== "linux") {
      return NextResponse.json(
        { error: "Background updates run on Linux VPS only." },
        { status: 400 }
      );
    }

    const started = await startBackgroundPanelUpdate(repoPath, fromVersion);
    if (!started.ok) {
      return NextResponse.json({ error: started.error ?? "Could not start update" }, { status: 409 });
    }

    await logActivity("panel_update_started", { meta: { fromVersion } });
    const job = await readUpdateJob(repoPath);
    return NextResponse.json({ started: true, action: "start", job });
  }

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
