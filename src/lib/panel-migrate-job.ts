import { readFile, writeFile, unlink, readdir, stat } from "fs/promises";
import { spawn, execSync } from "child_process";
import path from "path";
import { resolvePanelRepoPathSync } from "@/lib/panel-repo-path";

export const MIGRATE_LOCK_PATH = "/tmp/nexlify-migrate-in-progress";
export const MIGRATE_JOB_PATH = "/tmp/nexlify-migrate-job.json";

export type MigrateJobProgress = {
  phase: string;
  current: number;
  total: number;
};

export type MigrateJob = {
  id: string;
  status: "running" | "done" | "failed";
  dryRun: boolean;
  filePath: string;
  source: string;
  options: Record<string, unknown>;
  startedAt: string;
  finishedAt: string | null;
  message: string | null;
  progress: MigrateJobProgress | null;
  preview?: unknown;
  result?: unknown;
  error?: string;
  pid?: number;
};

export async function readMigrateJob(): Promise<MigrateJob | null> {
  try {
    const raw = await readFile(MIGRATE_JOB_PATH, "utf8");
    return JSON.parse(raw) as MigrateJob;
  } catch {
    return null;
  }
}

export async function writeMigrateJob(job: MigrateJob): Promise<void> {
  await writeFile(MIGRATE_JOB_PATH, JSON.stringify(job), "utf8");
}

export async function clearMigrateJob(): Promise<void> {
  try {
    await unlink(MIGRATE_JOB_PATH);
  } catch {
    /* ignore */
  }
  try {
    await unlink(MIGRATE_LOCK_PATH);
  } catch {
    /* ignore */
  }
}

export async function acquireMigrateLock(tag: string): Promise<void> {
  await writeFile(MIGRATE_LOCK_PATH, `${Date.now()}:${tag}`, "utf8");
}

export async function releaseMigrateLock(): Promise<void> {
  try {
    await unlink(MIGRATE_LOCK_PATH);
  } catch {
    /* ignore */
  }
}

/** Newest uploaded dump still on disk (last 48 hours, >= 1MB). */
export async function findLatestMigrateUpload(): Promise<{ path: string; size: number; mtimeMs: number } | null> {
  try {
    const names = await readdir("/tmp");
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    let best: { path: string; size: number; mtimeMs: number } | null = null;
    for (const name of names) {
      if (!name.startsWith("nexlify-migrate-") || !name.endsWith(".sql")) continue;
      const p = path.join("/tmp", name);
      try {
        const st = await stat(p);
        if (!st.isFile() || st.size < 1024 * 1024 || st.mtimeMs < cutoff) continue;
        if (!best || st.mtimeMs > best.mtimeMs) {
          best = { path: p, size: st.size, mtimeMs: st.mtimeMs };
        }
      } catch {
        /* ignore */
      }
    }
    return best;
  } catch {
    return null;
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

export async function reconcileMigrateJob(): Promise<MigrateJob | null> {
  const job = await readMigrateJob();
  if (!job) return null;
  if (job.status !== "running") return job;
  if (job.pid && isPidAlive(job.pid)) return job;
  // Look for detached worker by name
  try {
    const out = execSync("pgrep -f 'panel-migrate-background' 2>/dev/null || true", {
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
    "Migration worker stopped unexpectedly (panel restart or crash). Use Resume last upload — the SQL file is still on the server.";
  job.message = job.error;
  await writeMigrateJob(job);
  await releaseMigrateLock();
  return job;
}

export async function startMigrateBackgroundJob(input: {
  filePath: string;
  source: string;
  dryRun: boolean;
  options: Record<string, unknown>;
}): Promise<{ ok: true; job: MigrateJob; alreadyRunning?: boolean } | { ok: false; error: string; job?: MigrateJob }> {
  const existing = await reconcileMigrateJob();
  if (existing?.status === "running") {
    if (existing.filePath === input.filePath) {
      return { ok: true, job: existing, alreadyRunning: true };
    }
    return {
      ok: false,
      error:
        "A SQL migration is already running. Wait for it to finish, or use Resume last upload to reattach to the same dump.",
      job: existing,
    };
  }

  const repoPath = resolvePanelRepoPathSync();
  const id = `mig-${Date.now().toString(36)}`;
  const job: MigrateJob = {
    id,
    status: "running",
    dryRun: input.dryRun,
    filePath: input.filePath,
    source: input.source,
    options: input.options,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: input.dryRun ? "Starting preview…" : "Starting import…",
    progress: { phase: "initializing", current: 0, total: 100 },
  };
  await writeMigrateJob(job);
  await acquireMigrateLock(id);

  const workerTs = path.join(repoPath, "scripts", "panel-migrate-background.ts");
  const logFile = "/tmp/nexlify-migrate-worker.log";
  const launcher = `cd ${JSON.stringify(repoPath)} && exec >>${JSON.stringify(logFile)} 2>&1 && echo "[$(date -Is)] start ${JSON.stringify(id)}" && (command -v tsx >/dev/null && exec tsx ${JSON.stringify(workerTs)} ${JSON.stringify(MIGRATE_JOB_PATH)} || exec npx --yes tsx ${JSON.stringify(workerTs)} ${JSON.stringify(MIGRATE_JOB_PATH)})`;
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
  child.unref();
  job.pid = child.pid ?? undefined;
  await writeMigrateJob(job);
  return { ok: true, job };
}
