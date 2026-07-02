import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/internal-request";
import { getPanelServerSettings, getResolvedRepoPath } from "@/lib/panel-server";
import {
  isJobRunning,
  reconcileStaleUpdateJob,
  startBackgroundPanelUpdate,
} from "@/lib/panel-update-job";
import { resolvePatchUpdateScript } from "@/lib/panel-update";
import { readInstalledVersion } from "@/lib/panel-version";

/** Vendor (nexlify.live) triggers a background panel update on a customer VPS. */
export async function POST(req: NextRequest) {
  if (!isAuthorizedInternalRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (process.platform !== "linux") {
    return NextResponse.json({ error: "Updates run on Linux VPS only" }, { status: 400 });
  }

  const server = await getPanelServerSettings();
  const repoPath = getResolvedRepoPath(server);
  const patchScript = await resolvePatchUpdateScript(repoPath);
  if (!patchScript) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No update script on this panel. Run: curl -fsSL https://nexlify.live/install/fix-panel-auto-update.sh | sudo bash",
      },
      { status: 409 }
    );
  }

  const job = await reconcileStaleUpdateJob(repoPath);
  if (isJobRunning(job)) {
    return NextResponse.json({ ok: true, started: false, reason: "already_running" });
  }

  const { version: fromVersion } = await readInstalledVersion(repoPath);
  const result = await startBackgroundPanelUpdate(repoPath, fromVersion);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "Could not start update" },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, started: true, fromVersion });
}
