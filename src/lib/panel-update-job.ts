import { readFile, writeFile } from "fs/promises";
import { spawn, execSync } from "child_process";
import path from "path";
import { resolvePanelRepoPathSync } from "@/lib/panel-repo-path";

export type PanelUpdateJobStep = {
  name: string;
  ok: boolean;
  status: "pending" | "running" | "done" | "failed";
  output?: string;
};

export type PanelUpdateJob = {
  status: "idle" | "running" | "done" | "failed";
  progress: number;
  currentStep: string | null;
  /** Human-readable sub-status (e.g. "Generating pages 42/117…") */
  stepDetail?: string | null;
  steps: PanelUpdateJobStep[];
  startedAt: string | null;
  finishedAt: string | null;
  message: string | null;
  fromVersion: string | null;
  toVersion: string | null;
};

export function getUpdateProgressPath(repoPath: string): string {
  return path.join(repoPath, ".update-progress.json");
}

export function getUpdatePidPath(repoPath: string): string {
  return path.join(repoPath, ".update-progress.pid");
}

function isUpdateWorkerAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function findUpdateWorkerPid(): number | null {
  if (process.platform === "win32") return null;
  try {
    const out = execSync(
      "pgrep -f 'panel-update-background' 2>/dev/null || true",
      { encoding: "utf8", timeout: 5000 }
    ).trim();
    const pid = parseInt(out.split("\n")[0] ?? "", 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

const MAX_RUNNING_MS = 35 * 60 * 1000; // must exceed build timeout (~25 min) + swap/restart
const MAX_STUCK_AT_START_MS = 3 * 60 * 1000; // if stuck at "Starting update…" for 3 min, mark failed
/** git fetch/pull should finish in ~30s; treat >2.5 min as hung even if the worker PID is still alive */
const MAX_STUCK_GIT_PULL_MS = 150 * 1000;
/** Build step with a dead worker — fail fast so watchdog can bring the panel back */
const MAX_STUCK_BUILD_DEAD_MS = 90 * 1000;
const MAX_FAILED_MS = 2 * 60 * 1000; // auto-clear failed jobs quickly so Clear stuck / reload works
const MAX_DONE_MS = 2 * 60 * 1000; // auto-clear completed jobs so reload does not re-show banner
const MAX_SAME_VERSION_FAILED_MS = 5 * 60 * 1000; // re-sync failures stop nagging sooner

/**
 * True when the worker died during/after the late swap/restart window.
 * The new build is usually already on disk and the panel comes back via
 * panel-restart-safe / watchdog — UI used to show "Last update failed" anyway.
 */
export function looksLikeSuccessfulUpdateDespiteWorkerExit(job: PanelUpdateJob): boolean {
  const step = (job.currentStep ?? "").trim();
  const progress = Number(job.progress) || 0;
  if (progress >= 94) return true;
  if (step === "pm2 restart nexlify") return true;
  if (step === "prepare standalone" && progress >= 90) return true;
  if (step === "apply update" && progress >= 88) return true;
  // Steps array may already record a successful restart while status is still "running"
  const restartDone = job.steps?.some(
    (s) => s.name === "pm2 restart nexlify" && (s.ok || s.status === "done")
  );
  if (restartDone) return true;
  return false;
}

function promoteJobToDone(job: PanelUpdateJob, message: string): PanelUpdateJob {
  return {
    ...job,
    status: "done",
    progress: 100,
    currentStep: null,
    stepDetail: null,
    finishedAt: new Date().toISOString(),
    message,
  };
}

function isJobTimedOut(job: PanelUpdateJob, workerAlive: boolean): boolean {
  if (!job.startedAt) return false;
  const started = Date.parse(job.startedAt);
  if (!Number.isFinite(started)) return false;
  const elapsed = Date.now() - started;
  if (elapsed > MAX_RUNNING_MS) return true;
  // Fast-fail: if still stuck at "Starting update…" (2%), the worker likely crashed on boot
  if (elapsed > MAX_STUCK_AT_START_MS && job.progress <= 2 && job.currentStep === "Starting update…") {
    return true;
  }
  // Fast-fail hung git fetch/pull (UI shows 14% / "git pull")
  if (
    elapsed > MAX_STUCK_GIT_PULL_MS &&
    job.currentStep === "git pull" &&
    job.progress <= 16
  ) {
    return true;
  }
  // Worker died mid-build — do not leave UI at 88% until 35 min later
  if (
    !workerAlive &&
    elapsed > MAX_STUCK_BUILD_DEAD_MS &&
    (job.currentStep === "npm run build" ||
      job.currentStep === "prepare build" ||
      job.currentStep === "prepare standalone" ||
      job.currentStep === "pm2 restart nexlify")
  ) {
    return true;
  }
  return false;
}

function isFailedJobStale(job: PanelUpdateJob): boolean {
  if (job.status !== "failed" || !job.finishedAt) return false;
  const finished = Date.parse(job.finishedAt);
  return Number.isFinite(finished) && Date.now() - finished > MAX_FAILED_MS;
}

function isDoneJobStale(job: PanelUpdateJob): boolean {
  if (job.status !== "done" || !job.finishedAt) return false;
  const finished = Date.parse(job.finishedAt);
  return Number.isFinite(finished) && Date.now() - finished > MAX_DONE_MS;
}

/** Mark jobs stale when the background worker died (e.g. PM2 restart during update).
 *  Also auto-clear failed jobs so the error banner doesn't persist forever.
 */
export async function reconcileStaleUpdateJob(
  repoPath: string
): Promise<PanelUpdateJob | null> {
  const job = await readUpdateJob(repoPath);
  if (!job) return job;

  // Orphan idle placeholder left on disk — treat as no job so Clear stuck / reload work
  if (job.status === "idle" && !job.startedAt && !job.finishedAt) {
    await clearUpdateJob(repoPath);
    return null;
  }

  // Worker died during PM2 swap/restart after a successful build — treat as success, not failure.
  if (job.status === "failed" && looksLikeSuccessfulUpdateDespiteWorkerExit(job)) {
    const promoted = promoteJobToDone(
      job,
      job.message?.includes("finished") || job.message?.includes("Updated")
        ? job.message
        : "Update completed. The panel restarted successfully (the update worker exited during PM2 swap — that is normal)."
    );
    await writeUpdateJob(repoPath, promoted);
    return promoted;
  }

  // Same-version update failed (re-sync/rebuild) — clear after a few minutes so the banner does not persist
  if (
    job.status === "failed" &&
    job.fromVersion &&
    job.toVersion &&
    job.fromVersion === job.toVersion &&
    job.finishedAt
  ) {
    const finished = Date.parse(job.finishedAt);
    if (Number.isFinite(finished) && Date.now() - finished > MAX_SAME_VERSION_FAILED_MS) {
      await clearUpdateJob(repoPath);
      return await readUpdateJob(repoPath);
    }
  }

  // Auto-clear stale failed jobs so the banner disappears permanently
  if (job.status === "failed" && isFailedJobStale(job)) {
    await clearUpdateJob(repoPath);
    return await readUpdateJob(repoPath);
  }

  // Completed updates should not re-appear after a page reload
  if (job.status === "done" && isDoneJobStale(job)) {
    await clearUpdateJob(repoPath);
    return await readUpdateJob(repoPath);
  }

  if (job.status !== "running") return job;

  let workerPid: number | null = null;
  try {
    const pidRaw = await readFile(getUpdatePidPath(repoPath), "utf8");
    workerPid = parseInt(pidRaw.trim(), 10);
  } catch {
    /* no pid file */
  }

  const pidAlive =
    workerPid != null && Number.isFinite(workerPid) && isUpdateWorkerAlive(workerPid);
  const scriptAlive = findUpdateWorkerPid() != null;
  const alive = pidAlive || scriptAlive;
  const started = job.startedAt ? Date.parse(job.startedAt) : NaN;
  const elapsed = Number.isFinite(started) ? Date.now() - started : 0;

  // Still healthy
  if (alive && !isJobTimedOut(job, true)) return job;

  // Worker not up yet (just spawned)
  if (!alive && elapsed < 45_000 && !isJobTimedOut(job, false)) return job;

  // Dead worker but not timed out yet — only keep waiting early in the job
  if (!alive && !isJobTimedOut(job, false) && elapsed < MAX_STUCK_AT_START_MS) {
    return job;
  }

  // Timed out (or worker dead past grace) — stop hung git/update children so the next attempt can run.
  if (alive) {
    try {
      const { execSync } = require("child_process") as typeof import("child_process");
      if (workerPid != null && Number.isFinite(workerPid)) {
        try {
          process.kill(workerPid, "SIGTERM");
        } catch {
          /* already gone */
        }
      }
      execSync("pkill -f panel-update-background || true; pkill -f 'git fetch origin' || true", {
        stdio: "ignore",
        timeout: 5000,
      });
    } catch {
      /* best-effort */
    }
  }

  // Late-stage worker death (PM2 swap/restart) is expected — the new build is already live.
  if (looksLikeSuccessfulUpdateDespiteWorkerExit(job)) {
    const reconciledDone = promoteJobToDone(
      job,
      "Update completed. Panel restarted on the new build (update worker exited during PM2 swap — that is normal)."
    );
    await writeUpdateJob(repoPath, reconciledDone);
    try {
      await writeFile(getUpdatePidPath(repoPath), "", "utf8");
    } catch {
      /* ignore */
    }
    try {
      const { unlinkSync } = require("fs") as typeof import("fs");
      unlinkSync(path.join(repoPath, ".update-in-progress"));
    } catch {
      /* ignore */
    }
    return reconciledDone;
  }

  const reconciled: PanelUpdateJob = {
    ...job,
    status: "failed",
    currentStep: null,
    finishedAt: new Date().toISOString(),
    message:
      job.currentStep === "git pull" && job.progress <= 16
        ? "Update stuck on git pull/fetch (network, GitHub access, or git auth prompt). Cleared — run SSH repair: curl -fsSL 'https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/scripts/fix-remote-update-now.sh' | sudo bash"
        : job.progress <= 2 && job.currentStep === "Starting update…"
        ? (() => {
            let detail = "The update worker crashed before it could start. This usually means tsx is not installed or Node.js is too old.";
            try {
              const { readFileSync } = require("fs") as typeof import("fs");
              const errLog = readFileSync(path.join(repoPath, ".update-worker-err.log"), "utf-8").trim();
              if (errLog) detail += `\n\nError log:\n${errLog.slice(-1500)}`;
            } catch {}
            detail += `\n\nFix: SSH into the server and run:\n  cd ${repoPath} && npm install -g tsx && node --version\nThen try the update again.`;
            return detail;
          })()
        : job.currentStep === "npm install"
        ? "Update was interrupted (often during npm install when the server restarts). The panel may already be up to date — reload the page or run Update again from Settings → Updates."
        : job.currentStep === "npm run build" || job.currentStep === "prepare build" || job.currentStep === "prepare standalone"
        ? "Update stopped during the build (worker crashed or timed out). The previous build should still be on disk — the watchdog will restart the panel. Retry from Settings → Updates, or SSH: curl -fsSL 'https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/scripts/rebuild-panel-safe.sh' | sudo bash"
        : job.currentStep === "sync panel files"
          ? "Update failed while syncing files from nexlify.live. Check disk space and that the vendor tarball is published, then try again."
          : job.currentStep === "pm2 restart nexlify"
          ? "Update built successfully but the restart step was interrupted. The panel health watchdog should recover within a few minutes, or run: bash scripts/panel-restart-safe.sh"
          : `Update stopped at "${job.currentStep ?? "unknown step"}". The background worker is no longer running.`,
  };
  await writeUpdateJob(repoPath, reconciled);
  try {
    await writeFile(getUpdatePidPath(repoPath), "", "utf8");
  } catch {
    /* ignore */
  }
  try {
    const { unlinkSync } = require("fs") as typeof import("fs");
    unlinkSync(path.join(repoPath, ".update-in-progress"));
  } catch {
    /* ignore */
  }
  return reconciled;
}

export async function readUpdateJob(repoPath: string): Promise<PanelUpdateJob | null> {
  try {
    const raw = await readFile(getUpdateProgressPath(repoPath), "utf8");
    return JSON.parse(raw) as PanelUpdateJob;
  } catch {
    return null;
  }
}

export async function clearUpdateJob(repoPath: string): Promise<void> {
  // Hard-delete progress files so UI cannot re-read a stuck 88% / failed job.
  try {
    const { unlinkSync } = require("fs") as typeof import("fs");
    for (const f of [
      getUpdateProgressPath(repoPath),
      getUpdatePidPath(repoPath),
      path.join(repoPath, ".update-in-progress"),
    ]) {
      try {
        unlinkSync(f);
      } catch {
        /* missing */
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const { execSync } = require("child_process") as typeof import("child_process");
    execSync("pkill -f panel-update-background || true", { stdio: "ignore", timeout: 5000 });
  } catch {
    /* ignore */
  }
}

export async function writeUpdateJob(repoPath: string, job: PanelUpdateJob): Promise<void> {
  await writeFile(getUpdateProgressPath(repoPath), JSON.stringify(job, null, 2), "utf8");
}

export function isJobRunning(job: PanelUpdateJob | null | undefined): boolean {
  return job?.status === "running";
}

const STEP_PROGRESS: Record<string, number> = {
  "git stash local changes": 6,
  "git pull": 14,
  "bootstrap update scripts": 18,
  "sync panel files": 26,
  "npm install": 34,
  "npm install (skipped)": 38,
  "prisma db push": 42,
  "prisma generate": 48,
  "prisma (skipped)": 50,
  "prepare build": 52,
  // End-of-build assigned %; UI climbs during compile via stdout + heartbeat
  "npm run build": 90,
  "prepare standalone": 94,
  "pm2 restart nexlify": 98,
  // Prebuilt path steps (download → extract → apply replaces the old single step)
  "download update": 30,
  "extract update": 40,
  "apply update": 90,
};

export function progressForStep(stepName: string): number {
  return STEP_PROGRESS[stepName] ?? 50;
}

export async function startBackgroundPanelUpdate(
  repoPath: string,
  fromVersion: string,
  targetVersion?: string,
  opts?: { force?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  repoPath = resolvePanelRepoPathSync(repoPath);
  const existing = await reconcileStaleUpdateJob(repoPath);
  if (isJobRunning(existing)) {
    return { ok: false, error: "An update is already running" };
  }

  const initialJob: PanelUpdateJob = {
    status: "running",
    progress: 2,
    currentStep: "Starting update…",
    steps: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: null,
    fromVersion,
    toVersion: targetVersion?.replace(/^v/i, "").trim() || null,
  };
  await writeUpdateJob(repoPath, initialJob);

  const launcherPath = path.join(repoPath, "scripts", "panel-update-background.sh");
  const tsScriptPath = path.join(repoPath, "scripts", "panel-update-background.ts");
  const errLogPath = path.join(repoPath, ".update-worker-err.log");

  const runCmd =
    process.platform === "linux"
      ? // Prefer setsid -w so the outer bash PID stays alive with the worker (PID file stays valid).
        `(command -v setsid >/dev/null 2>&1 && setsid -w bash -c 'CMD') || bash -c 'CMD'`
      : `bash -c 'CMD'`;

  // Prefer bash launcher (cd to real panel root + tsx); fall back to tsx on .ts for older installs.
  const workerCandidates = [
    `bash ${JSON.stringify(launcherPath)}`,
    `npx tsx ${JSON.stringify(tsScriptPath)}`,
    `npx --yes tsx ${JSON.stringify(tsScriptPath)}`,
    `node --import tsx ${JSON.stringify(tsScriptPath)}`,
  ];

  let spawned = false;
  for (const workerCmd of workerCandidates) {
    const fullCmd = runCmd.replace("CMD", `${workerCmd} 2>>${JSON.stringify(errLogPath)}`);
    try {
      const child = spawn("bash", ["-c", fullCmd], {
        cwd: repoPath,
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          PANEL_REPO_PATH: repoPath,
          ...(opts?.force ? { PANEL_UPDATE_FORCE: "1" } : {}),
        },
        windowsHide: true,
      });
      child.unref();

      // If the process fails to spawn, try next candidate
      let spawnFailed = false;
      child.on("error", () => { spawnFailed = true; });

      // Give it a moment to see if spawn itself fails
      await new Promise((r) => setTimeout(r, 200));

      if (spawnFailed || !child.pid) continue;

      spawned = true;
      await writeFile(getUpdatePidPath(repoPath), String(child.pid), "utf8");

      // Write error to job file when worker crashes — always, not just at startup.
      // Previously this was gated on progress <= 2, which left mid-update crashes
      // (e.g. at 48% during prebuilt apply) stuck at "running" forever.
      child.on("exit", async (code, signal) => {
        if (code === 0 && signal !== "SIGKILL") return;
        try {
          const job = await readUpdateJob(repoPath);
          if (job && job.status === "running") {
            // Outer setsid/bash can exit while a late-stage update already swapped .next —
            // do not paint a false "failed" banner when the panel is coming back on the new build.
            if (looksLikeSuccessfulUpdateDespiteWorkerExit(job)) {
              await writeUpdateJob(
                repoPath,
                promoteJobToDone(
                  job,
                  "Update completed. Panel restarted on the new build (update worker process ended during PM2 swap — that is normal)."
                )
              );
              return;
            }
            let errDetail = `Worker exited with code ${code} (signal: ${signal})`;
            try {
              const { readFileSync } = await import("fs");
              const errLog = readFileSync(errLogPath, "utf-8").trim();
              if (errLog) errDetail += `\n${errLog.slice(-2000)}`;
            } catch {}
            await writeUpdateJob(repoPath, {
              ...job,
              status: "failed",
              currentStep: null,
              finishedAt: new Date().toISOString(),
              message: `Update worker crashed: ${errDetail}. Try running manually: cd ${repoPath} && bash scripts/panel-update-background.sh`,
            });
          }
        } catch {}
      });

      break;
    } catch {
      continue;
    }
  }

  if (!spawned) {
    // All tsx candidates failed — write a helpful error
    let errDetail = "";
    try {
      const { readFileSync } = await import("fs");
      errDetail = readFileSync(errLogPath, "utf-8").trim().slice(-1000);
    } catch {}
    await writeUpdateJob(repoPath, {
      ...initialJob,
      status: "failed",
      currentStep: null,
      finishedAt: new Date().toISOString(),
      message: `Could not start update worker. None of the tsx runners are available on this server.${errDetail ? `\n${errDetail}` : ""}\nTry: npm install -g tsx`,
    });
    return { ok: false, error: "Could not start update worker — tsx not available" };
  }

  return { ok: true };
}
