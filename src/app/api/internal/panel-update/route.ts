import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/internal-request";
import { getPanelServerSettingsSafe, getResolvedRepoPath } from "@/lib/panel-server";
import {
  isJobRunning,
  reconcileStaleUpdateJob,
  startBackgroundPanelUpdate,
} from "@/lib/panel-update-job";
import { resolvePatchUpdateScript } from "@/lib/panel-update";
import { getPanelVersionInfo, readInstalledVersion } from "@/lib/panel-version";
import { getPanelUpdateStatus } from "@/lib/panel-update-auto";

import { apiMutationErrorResponse } from "@/lib/parse-json-body";
/** Vendor (nexlify.live) triggers a background panel update on a customer VPS. */
export async function POST(req: NextRequest) {
  try {
  if (!isAuthorizedInternalRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (process.platform !== "linux") {
    return NextResponse.json({ error: "Updates run on Linux VPS only" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const force = body?.force === true || body?.action === "force";

  const server = await getPanelServerSettingsSafe();
  const repoPath = getResolvedRepoPath(server);
  const patchScript = await resolvePatchUpdateScript(repoPath);
  const versionInfo = await getPanelVersionInfo(repoPath);
  if (!patchScript && !versionInfo.isGitRepo) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This panel has no git checkout and no update script. On the VPS run: curl -fsSL https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/scripts/fix-remote-update-now.sh | sudo bash",
      },
      { status: 409 }
    );
  }

  const job = await reconcileStaleUpdateJob(repoPath);
  if (isJobRunning(job)) {
    return NextResponse.json({ ok: true, started: false, reason: "already_running" });
  }

  const status = await getPanelUpdateStatus();
  if (!force && !status.updateAvailable) {
    return NextResponse.json({
      ok: true,
      started: false,
      reason: "already_latest",
      fromVersion: status.installedVersion,
      latestVersion: status.latestVersion,
    });
  }

  if (force) {
    process.env.PANEL_UPDATE_FORCE = "1";
  }

  const { version: fromVersion } = await readInstalledVersion(repoPath);
  const result = await startBackgroundPanelUpdate(repoPath, fromVersion, undefined, { force });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "Could not start update" },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    started: true,
    fromVersion,
    latestVersion: status.latestVersion,
    forced: force,
  });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
