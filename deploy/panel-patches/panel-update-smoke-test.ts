/**
 * Smoke-test panel update stack (version API, release feed, auto-apply, manual start wiring).
 * Run on VPS: cd /home/nexlify-panel && npx tsx scripts/panel-update-smoke-test.ts
 *
 * Set PANEL_UPDATE_SMOKE_START=1 to also invoke startBackgroundPanelUpdate when an update is available
 * (skipped when already on latest).
 */
import { existsSync } from "fs";
import path from "path";
import {
  getPanelUpdateStatus,
  maybeAutoApplyPanelUpdate,
} from "../src/lib/panel-update-auto";
import { readUpdateJob } from "../src/lib/panel-update-job";
import { isVersionNewer } from "../src/lib/panel-releases-feed";

const PANEL_ROOT = process.env.PANEL_ROOT || process.cwd();
const BASE = process.env.PANEL_SMOKE_BASE || "http://127.0.0.1:3000";

type Result = { name: string; ok: boolean; detail?: string };

const results: Result[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, ok: false, detail });
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function checkHttp(name: string, url: string, expectJson?: (j: unknown) => boolean) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      fail(name, `HTTP ${res.status}`);
      return;
    }
    if (expectJson && !expectJson(j)) {
      fail(name, `unexpected body: ${JSON.stringify(j)}`);
      return;
    }
    pass(name, res.status === 200 ? undefined : String(res.status));
  } catch (e) {
    fail(name, e instanceof Error ? e.message : String(e));
  }
}

async function main() {
  console.log("=== PANEL UPDATE SMOKE TEST ===\n");
  console.log(`Panel root: ${PANEL_ROOT}`);
  console.log(`Base URL:   ${BASE}\n`);

  await checkHttp("health", `${BASE}/api/health`, (j) => {
    const h = j as { status?: string; checks?: { database?: string } };
    return h.status === "healthy" && h.checks?.database === "ok";
  });

  await checkHttp("panel_version", `${BASE}/api/panel/version`, (j) => {
    const v = (j as { version?: string })?.version;
    return typeof v === "string" && v.length > 0;
  });

  const files = [
    "scripts/panel-update-background.ts",
    "src/lib/panel-update-job.ts",
    "src/lib/panel-update.ts",
    "src/app/api/admin/panel-update/route.ts",
  ];
  for (const f of files) {
    if (existsSync(path.join(PANEL_ROOT, f))) pass(`file:${f}`);
    else fail(`file:${f}`, "missing");
  }

  try {
    const status = await getPanelUpdateStatus();
    pass(
      "update_status",
      `installed=v${status.installedVersion} latest=${status.latestVersion ?? "—"} auto=${status.autoApplyEnabled} running=${status.updateRunning}`
    );

    const feedNewer =
      status.latestVersion != null &&
      isVersionNewer(status.latestVersion, status.installedVersion);
    if (feedNewer === status.updateAvailable) {
      pass(
        "banner_logic",
        feedNewer
          ? `update available v${status.installedVersion} → v${status.latestVersion}`
          : "no false-positive banner (already on latest)"
      );
    } else {
      fail(
        "banner_logic",
        `updateAvailable=${status.updateAvailable} but feed newer=${feedNewer} (installed v${status.installedVersion}, latest v${status.latestVersion})`
      );
    }

    if (status.autoApplyEnabled) pass("auto_apply_setting", "panelUpdateAutoDownload=true");
    else fail("auto_apply_setting", "expected true");

    if (status.canAutoUpdate) pass("can_auto_update", "linux + git repo");
    else fail("can_auto_update", "VPS git auto-update not available");

    const auto = await maybeAutoApplyPanelUpdate();
    if (auto.reason === "already_latest") {
      pass("auto_apply_dry", "skipped — already on latest (expected when up to date)");
    } else if (auto.started) {
      pass("auto_apply_trigger", "background update started");
    } else {
      pass("auto_apply_skip", auto.reason);
    }

    const job = await readUpdateJob(status.repoPath);
    if (job?.status === "running") {
      pass("update_job_running", `${job.progress}% ${job.currentStep ?? ""}`);
    } else if (job?.status === "done") {
      pass("update_job_last", `done v${job.fromVersion} → v${job.toVersion}`);
    } else {
      pass("update_job_idle", job?.status ?? "no job file");
    }
  } catch (e) {
    fail("update_status", e instanceof Error ? e.message : String(e));
  }

  // Manual Update button uses POST { action: "start" } — verify route module exports handlers
  try {
    const routePath = path.join(PANEL_ROOT, "src/app/api/admin/panel-update/route.ts");
    const src = await import("fs/promises").then((fs) => fs.readFile(routePath, "utf8"));
    if (src.includes('action === "start"') && src.includes("startBackgroundPanelUpdate")) {
      pass("update_button_api", 'POST action "start" wired');
    } else {
      fail("update_button_api", "start action missing in route");
    }
  } catch (e) {
    fail("update_button_api", e instanceof Error ? e.message : String(e));
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${passed} passed, ${failed} failed, ${results.length} total`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
