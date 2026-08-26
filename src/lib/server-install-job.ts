import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, readdirSync, renameSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export type InstallJob = {
  id: string;
  progress: number;
  step: string;
  logs: string[];
  done: boolean;
  error?: string;
  result?: Record<string, unknown>;
};

const jobs = new Map<string, InstallJob>();
const MAX_LOGS = 500;

function jobDir() {
  return join(tmpdir(), "nexlify-install-jobs");
}

function jobPath(id: string) {
  return join(jobDir(), `${id}.json`);
}

function persist(job: InstallJob) {
  jobs.set(job.id, job);
  try {
    mkdirSync(jobDir(), { recursive: true });
    const tmp = `${jobPath(job.id)}.tmp`;
    writeFileSync(tmp, JSON.stringify(job), "utf8");
    try {
      renameSync(tmp, jobPath(job.id));
    } catch {
      writeFileSync(jobPath(job.id), JSON.stringify(job), "utf8");
    }
  } catch {
    /* disk persist is best-effort so cluster poll still works when it can */
  }
}

function newId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function getInstallJob(id: string): InstallJob | undefined {
  const mem = jobs.get(id);
  if (mem) return mem;
  try {
    const raw = readFileSync(jobPath(id), "utf8");
    const job = JSON.parse(raw) as InstallJob;
    if (job?.id) {
      jobs.set(job.id, job);
      return job;
    }
  } catch {
    /* missing */
  }
  return undefined;
}

export function appendInstallLog(id: string, line: string) {
  const job = getInstallJob(id);
  if (!job || job.done) return;
  const parts = line.replace(/\r/g, "\n").split("\n").map((l) => l.trimEnd()).filter(Boolean);
  for (const part of parts) job.logs.push(part);
  if (job.logs.length > MAX_LOGS) job.logs.splice(0, job.logs.length - MAX_LOGS);
  persist(job);
}

export function createInstallJob(): string {
  const id = newId();
  persist({ id, progress: 0, step: "Starting…", logs: [], done: false });
  return id;
}

export function completeInstallJob(id: string, result: Record<string, unknown>) {
  const job = getInstallJob(id);
  if (!job) return;
  job.progress = 100;
  job.step = "Install complete";
  job.done = true;
  job.result = result;
  persist(job);
}

export function failInstallJob(id: string, error: string) {
  const job = getInstallJob(id);
  if (!job) return;
  job.error = error;
  job.done = true;
  job.step = "Failed";
  persist(job);
}

export function setInstallStep(id: string, step: string, progress: number) {
  const job = getInstallJob(id);
  if (!job || job.done) return;
  job.step = step;
  job.progress = Math.max(0, Math.min(99, Math.round(progress)));
  persist(job);
}

export function pruneInstallJobs() {
  try {
    if (!existsSync(jobDir())) return;
    const now = Date.now();
    for (const name of readdirSync(jobDir())) {
      if (!name.startsWith("job_") || !name.endsWith(".json")) continue;
      const full = join(jobDir(), name);
      try {
        const st = JSON.parse(readFileSync(full, "utf8")) as InstallJob;
        const ts = Number(String(st.id).split("_")[1] || 0);
        if (ts && now - ts > 3_600_000) unlinkSync(full);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  if (jobs.size < 50) return;
  const keys = [...jobs.keys()].slice(0, jobs.size - 40);
  for (const k of keys) jobs.delete(k);
}
