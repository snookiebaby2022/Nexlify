import { readFile, unlink } from "fs/promises";
import { spawn, execSync } from "child_process";
import path from "path";
import { resolvePanelRepoPathSync } from "@/lib/panel-repo-path";
import { acquireExclusiveLockOrSteal, releaseLock, writeJsonAtomic } from "@/lib/job-file-lock";

export const BACKUP_LOCK_PATH = "/tmp/nexlify-backup-in-progress";
export const BACKUP_JOB_PATH = "/tmp/nexlify-backup-job.json";

export type BackupJobProgress = {
  phase: string;
  current: number;
  total: number;
};

export type BackupJob = {
  id: string;
  status: "running" | "done" | "failed";
  trigger: "manual" | "cron" | "settings";
  format: "json" | "zip" | "gzip";
  includePasswords: boolean;
  target: "local" | "remote";
  startedAt: string;
  finishedAt: string | null;
  message: string | null;
  progress: BackupJobProgress | null;
  path?: string;
  checksum?: string;
  size?: number;
  error?: string;
  pid?: number;
};

export async function readBackupJob(): Promise<BackupJob | null> {
  try {
    const raw = await readFile(BACKUP_JOB_PATH, "utf8");
    return JSON.parse(raw) as BackupJob;
  } catch {
    return null;
  }
}

export async function writeBackupJob(job: BackupJob): Promise<void> {
  await writeJsonAtomic(BACKUP_JOB_PATH, job);
}

export async function clearBackupJob(): Promise<void> {
  try {
    await unlink(BACKUP_JOB_PATH);
  } catch {
    /* ignore */
  }
  try {
    await unlink(BACKUP_LOCK_PATH);
  } catch {
    /* ignore */
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function reconcileBackupJob(): Promise<BackupJob | null> {
  const job = await readBackupJob();
  if (!job) return null;
  if (job.status !== "running") return job;
  if (job.pid && isPidAlive(job.pid)) return job;
  try {
    const out = execSync("pgrep -f 'panel-backup-background' 2>/dev/null || true", {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    if (out) return job;
  } catch {
    /* ignore */
  }
  job.status = "failed";
  job.finishedAt = new Date().toISOString();
  job.error =
    job.error ||
    "Backup worker stopped unexpectedly (panel restart or crash). Try creating the backup again.";
  job.message = job.error;
  await writeBackupJob(job);
  try {
    await releaseLock(BACKUP_LOCK_PATH);
  } catch {
    /* ignore */
  }
  return job;
}

export async function startBackupBackgroundJob(input: {
  trigger: BackupJob["trigger"];
  format: BackupJob["format"];
  includePasswords: boolean;
  target: "local" | "remote";
}): Promise<
  { ok: true; job: BackupJob; alreadyRunning?: boolean } | { ok: false; error: string; job?: BackupJob }
> {
  const existing = await reconcileBackupJob();
  if (existing?.status === "running") {
    return { ok: true, job: existing, alreadyRunning: true };
  }

  const repoPath = resolvePanelRepoPathSync();
  const id = `bak-${Date.now().toString(36)}`;
  const job: BackupJob = {
    id,
    status: "running",
    trigger: input.trigger,
    format: input.format,
    includePasswords: input.includePasswords,
    target: input.target,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: "Starting backup…",
    progress: { phase: "initializing", current: 0, total: 100 },
  };
  const locked = await acquireExclusiveLockOrSteal(
    BACKUP_LOCK_PATH,
    `${Date.now()}:${id}`,
    async () => {
      const job = await readBackupJob();
      return !job || job.status !== "running" || !(job.pid && isPidAlive(job.pid));
    }
  );
  if (!locked) {
    const raced = await reconcileBackupJob();
    if (raced?.status === "running") {
      return { ok: true, job: raced, alreadyRunning: true };
    }
    return { ok: false, error: "Could not acquire backup lock. Try again." };
  }

  await writeBackupJob(job);

  const workerTs = path.join(repoPath, "scripts", "panel-backup-background.ts");
  const logFile = "/tmp/nexlify-backup-worker.log";
  const launcher = `cd ${JSON.stringify(repoPath)} && exec >>${JSON.stringify(logFile)} 2>&1 && echo "[$(date -Is)] start ${JSON.stringify(id)}" && (command -v tsx >/dev/null && exec tsx ${JSON.stringify(workerTs)} ${JSON.stringify(BACKUP_JOB_PATH)} || exec npx --yes tsx ${JSON.stringify(workerTs)} ${JSON.stringify(BACKUP_JOB_PATH)})`;
  const child = spawn("bash", ["-c", launcher], {
    cwd: repoPath,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      PANEL_REPO_PATH: repoPath,
      NODE_OPTIONS: "--max-old-space-size=16384",
    },
  });
  child.on("error", (err) => {
    console.error("[backup] worker spawn failed", err);
  });
  child.unref();
  job.pid = child.pid ?? undefined;
  await writeBackupJob(job);
  return { ok: true, job };
}
