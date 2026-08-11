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

const BOOTSTRAP_SCRIPT_URL =
  process.env.PANEL_BOOTSTRAP_SCRIPT_URL?.trim() ||
  "https://nexlify.live/install/fix-panel-auto-update.sh";

/** Attempt to bootstrap `apply-panel-fast-update.sh` via the vendor install script. */
async function tryBootstrapUpdateScript(repoPath: string): Promise<boolean> {
  try {
    const { execSync } = await import("child_process");
    execSync(`curl -fsSL ${JSON.stringify(BOOTSTRAP_SCRIPT_URL)} | bash`, {
      cwd: repoPath,
      timeout: 60_000,
      stdio: "pipe",
    });
    return true;
  } catch (e) {
    console.warn("[panel-update] Bootstrap script failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

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

  let patchScript = await resolvePatchUpdateScript(repoPath);
  if (!patchScript) {
    // Auto-bootstrap the update script so older installs don't permanently block remote updates
    console.log("[panel-update] apply-panel-fast-update.sh not found — attempting auto-bootstrap");
    const bootstrapped = await tryBootstrapUpdateScript(repoPath);
    if (bootstrapped) {
      patchScript = await resolvePatchUpdateScript(repoPath);
    }
    if (!patchScript) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No update script on this panel. Run on the server: " +
            `curl -fsSL ${BOOTSTRAP_SCRIPT_URL} | sudo bash`,
          bootstrapUrl: BOOTSTRAP_SCRIPT_URL,
        },
        { status: 409 }
      );
    }
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
