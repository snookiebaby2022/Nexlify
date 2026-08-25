import { readFile, writeFile, stat } from "fs/promises";
import { spawn, execSync } from "child_process";
import path from "path";
import { resolvePanelRepoPathSync } from "@/lib/panel-repo-path";
import { compareVersions } from "@/lib/panel-releases-feed";
import { acquireExclusiveLockOrSteal, releaseLock, writeJsonAtomic } from "@/lib/job-file-lock";

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

export function getUpdateLockPath(repoPath: string): string {
  return path.join(repoPath, ".update.lock");
}

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

function pgrepByPattern(pattern: string): number[] {
  if (process.platform === "win32") return [];
  try {
    const out = execSync(`pgrep -f ${JSON.stringify(pattern)} 2>/dev/null || true`, {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    const pids = out
      .split("\n")
      .map((line) => parseInt(line.trim(), 10))
      .filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== process.pid);
    const verified: number[] = [];
    for (const pid of pids) {
      try {
        const args = execSync(`ps -p ${pid} -o args= 2>/dev/null`, {
          encoding: "utf8",
          timeout: 3000,
        }).trim();
        if (!args || !args.includes(pattern)) continue;
        // pgrep -f matches its own argv and ssh/bash wrappers — ignore those.
        if (/\bpgrep\b/.test(args) || /\bps\s+-p\b/.test(args)) continue;
        if (/^\s*bash\s+-c\s+/i.test(args) && !/\b(bash|sh)\s+\S*apply-panel-fast-update/.test(args)) {
          if (!/\b(bash|sh)\s+\S*panel-update-background/.test(args)) continue;
        }
        verified.push(pid);
      } catch {
        /* process gone */
      }
    }
    return verified;
  } catch {
    return [];
  }
}

function findUpdateWorkerPid(repoPath: string): number | null {
  const pids = pgrepByPattern(`${repoPath}/scripts/panel-update-background`);
  return pids[0] ?? null;
}

async function hasActiveUpdateSignal(repoPath: string): Promise<boolean> {
  const job = await readUpdateJob(repoPath);
  if (job?.status === "running") return true;
  if (findUpdateWorkerPid(repoPath) != null) return true;
  if (isPanelUpdateChildWorkAlive(repoPath)) return true;
  try {
    await stat(getUpdateLockPath(repoPath));
    // Lock file alone (no worker/build) is stale — stealable in startBackgroundPanelUpdate.
    return false;
  } catch {
    /* no lock */
  }
  try {
    const marker = path.join(repoPath, ".update-in-progress");
    const st = await stat(marker);
    const ageMs = Date.now() - st.mtimeMs;
    if (ageMs > 45 * 60 * 1000) return false;
    try {
      const raw = (await readFile(marker, "utf8")).trim();
      const pid = parseInt(raw, 10);
      if (Number.isFinite(pid) && pid > 0 && isUpdateWorkerAlive(pid)) return true;
    } catch {
      /* empty marker */
    }
    return ageMs < 3 * 60 * 1000 && isPanelUpdateChildWorkAlive(repoPath);
  } catch {
    /* no marker */
  }
  return false;
}

/** True when next build / apply-panel-fast-update is still running (outer worker may already be gone). */
export function isPanelUpdateChildWorkAlive(repoPath?: string): boolean {
  if (process.platform === "win32") return false;
  const root = repoPath?.trim() || resolvePanelRepoPathSync();
  // Do not match run-next.mjs — that is the live panel process on many installs.
  const patterns = [
    `${root}/scripts/panel-update-background`,
    `${root}/scripts/apply-panel-fast-update`,
    `${root}/scripts/run-panel-build`,
    `${root}/node_modules/.bin/next build`,
    "next/dist/bin/next build",
  ];
  return patterns.some((p) => pgrepByPattern(p).length > 0);
}

/**
 * Update is still in flight if the background worker, a build/apply child, or a
 * fresh .update-in-progress marker is present. Outer worker PID often dies while
 * `next build` continues — that must not flip the UI to "Update failed".
 */
export async function isPanelUpdateWorkAlive(repoPath: string): Promise<boolean> {
  const active = await hasActiveUpdateSignal(repoPath);

  // Worker/script PIDs with no job/lock/marker are orphans — must not block the UI forever.
  if (active && findUpdateWorkerPid(repoPath) != null) return true;
  if (!active) return false;

  if (isPanelUpdateChildWorkAlive(repoPath)) return true;

  try {
    const marker = path.join(repoPath, ".update-in-progress");
    const st = await stat(marker);
    const ageMs = Date.now() - st.mtimeMs;
    if (ageMs > 45 * 60 * 1000) return false;
    try {
      const raw = (await readFile(marker, "utf8")).trim();
      const pid = parseInt(raw, 10);
      if (Number.isFinite(pid) && pid > 0 && isUpdateWorkerAlive(pid)) return true;
    } catch {
      /* empty / touch marker */
    }
    // Fresh marker (apply-panel-fast-update often `touch`es without a PID) — trust briefly
    if (ageMs < 3 * 60 * 1000) return true;
    return false;
  } catch {
    /* no marker */
  }

  const job = await readUpdateJob(repoPath);
  if (job?.status === "running" && job.startedAt) {
    const elapsed = Date.now() - Date.parse(job.startedAt);
    if (Number.isFinite(elapsed) && elapsed < 45_000) return true;
  }
  return false;
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

async function readInstalledPackageVersion(repoPath: string): Promise<string | null> {
  const files = [
    path.join(repoPath, "package.json"),
    path.join(repoPath, ".next", "standalone", "package.json"),
  ];
  for (const file of files) {
    try {
      const raw = await readFile(file, "utf8");
      const v = (JSON.parse(raw) as { version?: unknown }).version;
      if (typeof v === "string" && v.trim()) return v.trim().replace(/^v/i, "");
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * True when package.json already reflects a successful update even if the
 * progress bar never reached the late swap/restart steps (common when PM2
 * restarts kill the worker around mid-build ~55–70%).
 */
export function installedVersionImpliesUpdateSuccess(
  job: PanelUpdateJob,
  installedVersion: string | null | undefined
): boolean {
  if (!installedVersion) return false;
  const installed = installedVersion.replace(/^v/i, "").trim();
  if (!installed) return false;

  const from = (job.fromVersion ?? "").replace(/^v/i, "").trim();
  const to = (job.toVersion ?? "").replace(/^v/i, "").trim();

  if (to && compareVersions(installed, to) >= 0) return true;
  if (from && compareVersions(installed, from) > 0) return true;
  return false;
}

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
  // Compile often sits at ~52–70% when PM2 swap kills the worker. Treat as success
  // so Updates cannot remain stuck at 60% after the new build is already live.
  if (
    progress >= 50 &&
    (step === "npm run build" || step === "prepare build" || step === "prepare standalone" || step === "apply update")
  ) {
    return true;
  }
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

async function promoteIfInstalledVersionSucceeded(
  repoPath: string,
  job: PanelUpdateJob
): Promise<PanelUpdateJob | null> {
  const installed = await readInstalledPackageVersion(repoPath);
  if (!installedVersionImpliesUpdateSuccess(job, installed)) return null;
  const to = (job.toVersion ?? installed ?? "").replace(/^v/i, "");
  const from = (job.fromVersion ?? "").replace(/^v/i, "");
  const promoted = promoteJobToDone(
    {
      ...job,
      toVersion: to || job.toVersion,
    },
    from && to && from !== to
      ? `Updated from v${from} to v${to}. Panel is already on the new build (progress UI was stuck after the restart — that is normal).`
      : `Update completed — panel is on v${installed}. Progress UI cleared after a mid-update restart.`
  );
  await writeUpdateJob(repoPath, promoted);
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
  return promoted;
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
      job.currentStep === "pm2 restart nexlify" ||
      job.currentStep === "apply update" ||
      job.currentStep === "download update" ||
      job.currentStep === "extract update")
  ) {
    return true;
  }
  // Worker dead with mid progress and no heartbeat for a few minutes — unstick UI
  if (!workerAlive && elapsed > 3 * 60 * 1000 && job.progress >= 20 && job.progress < 94) {
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
/** Kill update workers left running after a crashed/cleared job (prevents fake "Updating…"). */
function killOrphanUpdateWorkers(repoPath: string): void {
  if (process.platform === "win32") return;
  try {
    const { execSync } = require("child_process") as typeof import("child_process");
    execSync(
      `pkill -f ${JSON.stringify(`${repoPath}/scripts/panel-update-background`)} 2>/dev/null || true; ` +
        `pkill -f ${JSON.stringify(`${repoPath}/scripts/apply-panel-fast-update`)} 2>/dev/null || true`,
      { stdio: "ignore", timeout: 5000 }
    );
  } catch {
    /* ignore */
  }
}

export async function reconcileStaleUpdateJob(
  repoPath: string
): Promise<PanelUpdateJob | null> {
  const job = await readUpdateJob(repoPath);

  if (!job || job.status !== "running") {
    const active = await hasActiveUpdateSignal(repoPath);
    if (
      !active &&
      (findUpdateWorkerPid(repoPath) != null || isPanelUpdateChildWorkAlive(repoPath))
    ) {
      killOrphanUpdateWorkers(repoPath);
    }
  }

  if (!job) return job;

  // Orphan idle placeholder left on disk — treat as no job so Clear stuck / reload work
  if (job.status === "idle" && !job.startedAt && !job.finishedAt) {
    await clearUpdateJob(repoPath);
    return null;
  }

  // Package.json already on the target (or newer than fromVersion) — progress UI was
  // stranded mid-build (~60%) after PM2 swap killed the worker. Treat as success.
  if (job.status === "running" || job.status === "failed") {
    const versionDone = await promoteIfInstalledVersionSucceeded(repoPath, job);
    if (versionDone) return versionDone;
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
  const scriptAlive = findUpdateWorkerPid(repoPath) != null;
  const childAlive = await isPanelUpdateWorkAlive(repoPath);
  const alive = pidAlive || scriptAlive || childAlive;
  const started = job.startedAt ? Date.parse(job.startedAt) : NaN;
  const elapsed = Number.isFinite(started) ? Date.now() - started : 0;

  // Still healthy — including when outer worker died but next build / apply is alive
  if (alive && !isJobTimedOut(job, true)) return job;

  // Worker not up yet (just spawned)
  if (!alive && elapsed < 45_000 && !isJobTimedOut(job, false)) return job;

  // Dead worker but not timed out yet — only keep waiting early in the job
  if (!alive && !isJobTimedOut(job, false) && elapsed < MAX_STUCK_AT_START_MS) {
    return job;
  }

  // Build/apply still running: never mark failed (outer PID death is common mid-compile)
  if (childAlive || isPanelUpdateChildWorkAlive(repoPath)) {
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

  // Mid-progress stranding (e.g. 60% compile) but package.json already newer — success.
  const versionDoneLate = await promoteIfInstalledVersionSucceeded(repoPath, job);
  if (versionDoneLate) return versionDoneLate;

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
      getUpdateLockPath(repoPath),
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
    execSync(
      `pkill -f ${JSON.stringify(`${repoPath}/scripts/panel-update-background`)} 2>/dev/null || true; ` +
        `pkill -f ${JSON.stringify(`${repoPath}/scripts/apply-panel-fast-update`)} 2>/dev/null || true`,
      { stdio: "ignore", timeout: 5000 }
    );
  } catch {
    /* ignore */
  }
}

export async function writeUpdateJob(repoPath: string, job: PanelUpdateJob): Promise<void> {
  await writeJsonAtomic(getUpdateProgressPath(repoPath), job);
  if (job.status !== "running") {
    await releaseLock(getUpdateLockPath(repoPath));
  }
}

export function isJobRunning(job: PanelUpdateJob | null | undefined): boolean {
  return job?.status === "running";
}

const STEP_PROGRESS: Record<string, number> = {
  "git stash local changes": 6,
  "git pull": 14,
  "git fetch origin main": 12,
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
  "pm2 restart all": 98,
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
  const locked = await acquireExclusiveLockOrSteal(
    getUpdateLockPath(repoPath),
    `${Date.now()}:update`,
    async () => !(isJobRunning(existing) || (await isPanelUpdateWorkAlive(repoPath)))
  );
  if (!locked) {
    return { ok: false, error: "An update is already running" };
  }
  if (isJobRunning(existing) || (await isPanelUpdateWorkAlive(repoPath))) {
    await releaseLock(getUpdateLockPath(repoPath));
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

  const persisted = await readUpdateJob(repoPath);
  if (!persisted || persisted.status !== "running") {
    await releaseLock(getUpdateLockPath(repoPath));
    return { ok: false, error: "Could not persist update job state on disk" };
  }

  const launcherPath = path.join(repoPath, "scripts", "panel-update-background.sh");
  const tsScriptPath = path.join(repoPath, "scripts", "panel-update-background.ts");
  const errLogPath = path.join(repoPath, ".update-worker-err.log");

  const runCmd =
    process.platform === "linux"
      ? // Prefer setsid -w so the outer bash PID stays alive with the worker (PID file stays valid).
        `(command -v setsid >/dev/null 2>&1 && setsid -w bash -c 'CMD') || bash -c 'CMD'`
      : `bash -c 'CMD'`;

  // Prefer bash launcher (cd to real panel root + local tsx). npx is often missing from PM2 PATH → exit 127.
  const localTsx = path.join(repoPath, "node_modules", ".bin", "tsx");
  const tsxCli = path.join(repoPath, "node_modules", "tsx", "dist", "cli.mjs");
  const workerCandidates = [
    `bash ${JSON.stringify(launcherPath)}`,
    `${JSON.stringify(localTsx)} ${JSON.stringify(tsScriptPath)}`,
    `node ${JSON.stringify(tsxCli)} ${JSON.stringify(tsScriptPath)}`,
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
          PATH: [
            path.join(repoPath, "node_modules", ".bin"),
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            process.env.PATH || "",
          ].join(":"),
          LANG: "C.UTF-8",
          LC_ALL: "C.UTF-8",
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
            const versionDone = await promoteIfInstalledVersionSucceeded(repoPath, job);
            if (versionDone) return;
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
