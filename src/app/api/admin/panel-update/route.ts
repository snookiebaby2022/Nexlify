import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/lines";
import { getPanelServerSettings, getResolvedRepoPath } from "@/lib/panel-server";
import {
  DEFAULT_RELEASES_FEED_URL,
  fetchNexlifyReleasesFeed,
  isVersionNewer,
  normalizeReleasesFeed,
} from "@/lib/panel-releases-feed";
import { PANEL_RELEASES_FEED } from "@/lib/panel-releases-data";
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

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const light = req.nextUrl.searchParams.get("light") === "1";
    const server = await getPanelServerSettings();
    const repoPath = getResolvedRepoPath(server);

    const job = await reconcileStaleUpdateJob(repoPath);
    const updateRunning = isJobRunning(job);

    if (light) {
      const { version: installedVersion } = await readInstalledVersion(repoPath);
      return NextResponse.json({
        version: { installedVersion },
        job,
        updateRunning,
      }, {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          "Pragma": "no-cache",
        },
      });
    }

    const feedUrl =
      process.env.NEXLIFY_RELEASES_URL?.trim() ||
      (server.updateCheckUrl?.includes("panel-releases") ? server.updateCheckUrl : "") ||
      DEFAULT_RELEASES_FEED_URL;

    const [versionResult, releasesResult, patchScript] = await Promise.all([
      getPanelVersionInfoWithRelease(repoPath, server.updateCheckUrl || undefined),
      fetchNexlifyReleasesFeed(feedUrl).then(
        (feed) => ({ feed, error: null as string | null }),
        (e) => ({
          feed: null,
          error: e instanceof Error ? e.message : "Feed unavailable",
        })
      ),
      resolvePatchUpdateScript(repoPath),
    ]);

    const version = versionResult;
    let releasesFeed = releasesResult.feed;
    const releasesFeedError = releasesResult.error;
    if (releasesFeed) {
      releasesFeed = normalizeReleasesFeed(releasesFeed);
    } else {
      releasesFeed = PANEL_RELEASES_FEED;
    }
    const manualSteps = panelUpdateManualSteps(repoPath);
    const canAutoUpdate =
      process.platform === "linux" && (Boolean(patchScript) || version.isGitRepo);

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
      updateHistory: server.updateHistory ?? [],
      job,
      updateRunning,
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
      },
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
