import { readFile, writeFile } from "fs/promises";
import { spawn, execSync } from "child_process";
import path from "path";

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

const MAX_RUNNING_MS = 20 * 60 * 1000;
const MAX_STUCK_AT_START_MS = 3 * 60 * 1000; // if stuck at "Starting update…" for 3 min, mark failed
const MAX_FAILED_MS = 30 * 60 * 1000; // auto-clear failed jobs after 30 min
const MAX_DONE_MS = 2 * 60 * 1000; // auto-clear completed jobs so reload does not re-show banner
const MAX_SAME_VERSION_FAILED_MS = 5 * 60 * 1000; // re-sync failures stop nagging sooner

function isJobTimedOut(job: PanelUpdateJob): boolean {
  if (!job.startedAt) return false;
  const started = Date.parse(job.startedAt);
  if (!Number.isFinite(started)) return false;
  const elapsed = Date.now() - started;
  if (elapsed > MAX_RUNNING_MS) return true;
  // Fast-fail: if still stuck at "Starting update…" (2%), the worker likely crashed on boot
  if (elapsed > MAX_STUCK_AT_START_MS && job.progress <= 2 && job.currentStep === "Starting update…") return true;
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

  if (alive && !isJobTimedOut(job)) return job;

  const reconciled: PanelUpdateJob = {
    ...job,
    status: "failed",
    currentStep: null,
    finishedAt: new Date().toISOString(),
    message:
      job.progress <= 2 && job.currentStep === "Starting update…"
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
  const idle: PanelUpdateJob = {
    status: "idle",
    progress: 0,
    currentStep: null,
    steps: [],
    startedAt: null,
    finishedAt: null,
    message: null,
    fromVersion: null,
    toVersion: null,
  };
  await writeUpdateJob(repoPath, idle);
  try {
    await writeFile(getUpdatePidPath(repoPath), "", "utf8");
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
  "npm run build": 88,
  "prepare standalone": 94,
  "pm2 restart nexlify": 98,
};

export function progressForStep(stepName: string): number {
  return STEP_PROGRESS[stepName] ?? 50;
}

export async function startBackgroundPanelUpdate(
  repoPath: string,
  fromVersion: string
): Promise<{ ok: boolean; error?: string }> {
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
    toVersion: null,
  };
  await writeUpdateJob(repoPath, initialJob);

  const scriptPath = path.join(repoPath, "scripts", "panel-update-background.ts");
  const errLogPath = path.join(repoPath, ".update-worker-err.log");

  // Try multiple ways to run tsx — some customer VPS have tsx in different locations
  const runCmd =
    process.platform === "linux"
      ? `(command -v setsid >/dev/null 2>&1 && setsid bash -c 'CMD') || bash -c 'CMD'`
      : `bash -c 'CMD'`;

  const tsxCandidates = [
    `npx tsx ${JSON.stringify(scriptPath)}`,
    `npx --yes tsx ${JSON.stringify(scriptPath)}`,
    `node --import tsx ${JSON.stringify(scriptPath)}`,
  ];

  let spawned = false;
  for (const tsxCmd of tsxCandidates) {
    const fullCmd = runCmd.replace("CMD", `${tsxCmd} 2>>${JSON.stringify(errLogPath)}`);
    try {
      const child = spawn("bash", ["-c", fullCmd], {
        cwd: repoPath,
        detached: true,
        stdio: "ignore",
        env: process.env,
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

      // Write error to job file if worker exits within 30 seconds (crashed on boot)
      child.on("exit", async (code, signal) => {
        if (code === 0 && signal !== "SIGKILL") return;
        try {
          const job = await readUpdateJob(repoPath);
          if (job && job.status === "running" && job.progress <= 2) {
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
              message: `Update worker crashed on startup: ${errDetail}. Try running manually: cd ${repoPath} && npx tsx scripts/panel-update-background.ts`,
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
