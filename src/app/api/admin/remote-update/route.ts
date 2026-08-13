import { NextRequest, NextResponse } from "next/server";
import { requirePanelApiKey } from "@/lib/auth";
import {
  startBackgroundPanelUpdate,
  isJobRunning,
  reconcileStaleUpdateJob,
} from "@/lib/panel-update-job";
import { getResolvedRepoPath } from "@/lib/panel-server";
import { readInstalledVersion } from "@/lib/panel-version";
import { getPanelUpdateStatus } from "@/lib/panel-update-auto";

/**
 * Remote update trigger — called by the marketing site admin.
 * Requires the panel API secret (x-panel-api-key or Authorization).
 *
 * Body (optional JSON):
 *   { "force": true } — re-sync even when already on latest
 */
export async function POST(req: NextRequest) {
  const ok = await requirePanelApiKey(req);
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const force = body?.force === true;

  const server = await import("@/lib/panel-server").then((m) => m.getPanelServerSettings());
  const repoPath = getResolvedRepoPath(server);

  const job = await reconcileStaleUpdateJob(repoPath);
  if (isJobRunning(job)) {
    return NextResponse.json({ ok: false, error: "An update is already running" }, { status: 409 });
  }

  const status = await getPanelUpdateStatus();
  if (!force && !status.updateAvailable) {
    return NextResponse.json({
      ok: true,
      started: false,
      reason: "already_latest",
      installedVersion: status.installedVersion,
      latestVersion: status.latestVersion,
      message: `Already on latest (v${status.installedVersion})`,
    });
  }

  if (force) {
    process.env.PANEL_UPDATE_FORCE = "1";
  }

  const { version: fromVersion } = await readInstalledVersion(repoPath);
  const result = await startBackgroundPanelUpdate(repoPath, fromVersion);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    started: true,
    message: "Update started in background",
    fromVersion,
    latestVersion: status.latestVersion,
    forced: force,
  });
}

export async function GET(req: NextRequest) {
  const ok = await requirePanelApiKey(req);
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const server = await import("@/lib/panel-server").then((m) => m.getPanelServerSettings());
  const repoPath = getResolvedRepoPath(server);

  const job = await reconcileStaleUpdateJob(repoPath);
  const status = await getPanelUpdateStatus();
  const { version: installedVersion } = await readInstalledVersion(repoPath);

  return NextResponse.json({
    installedVersion,
    latestVersion: status.latestVersion,
    updateAvailable: status.updateAvailable,
    job,
    updateRunning: isJobRunning(job),
  });
}
