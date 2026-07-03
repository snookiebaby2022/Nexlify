import { NextRequest, NextResponse } from "next/server";
import { requirePanelApiKey } from "@/lib/auth";
import {
  startBackgroundPanelUpdate,
  isJobRunning,
  readUpdateJob,
  reconcileStaleUpdateJob,
} from "@/lib/panel-update-job";
import { getResolvedRepoPath } from "@/lib/panel-server";
import { readInstalledVersion } from "@/lib/panel-version";

/**
 * Remote update trigger — called by the marketing site admin.
 * Requires the panel API secret (x-panel-api-key or Authorization).
 */
export async function POST(req: NextRequest) {
  const ok = await requirePanelApiKey(req);
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const server = await import("@/lib/panel-server").then((m) => m.getPanelServerSettings());
  const repoPath = getResolvedRepoPath(server);

  const job = await reconcileStaleUpdateJob(repoPath);
  if (isJobRunning(job)) {
    return NextResponse.json({ ok: false, error: "An update is already running" }, { status: 409 });
  }

  const { version: fromVersion } = await readInstalledVersion(repoPath);
  const result = await startBackgroundPanelUpdate(repoPath, fromVersion);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Update started in background" });
}

export async function GET(req: NextRequest) {
  const ok = await requirePanelApiKey(req);
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const server = await import("@/lib/panel-server").then((m) => m.getPanelServerSettings());
  const repoPath = getResolvedRepoPath(server);

  const job = await reconcileStaleUpdateJob(repoPath);
  const { version: installedVersion } = await readInstalledVersion(repoPath);

  return NextResponse.json({
    installedVersion,
    job,
    updateRunning: isJobRunning(job),
  });
}
