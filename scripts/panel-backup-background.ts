/**
 * Detached panel backup worker — survives HTTP timeouts / short proxy limits.
 * Usage: npx tsx scripts/panel-backup-background.ts /tmp/nexlify-backup-job.json
 */
import { readFile, writeFile, unlink } from "fs/promises";
import { writePanelBackupFile } from "../src/lib/backup-run";

const jobPath = process.argv[2] || "/tmp/nexlify-backup-job.json";
const lockPath = "/tmp/nexlify-backup-in-progress";

type Job = {
  id: string;
  status: "running" | "done" | "failed";
  trigger: string;
  format: "json" | "zip" | "gzip";
  includePasswords: boolean;
  target: string;
  startedAt: string;
  finishedAt: string | null;
  message: string | null;
  progress: { phase: string; current: number; total: number } | null;
  path?: string;
  checksum?: string;
  size?: number;
  error?: string;
  pid?: number;
};

async function writeJob(job: Job) {
  await writeFile(jobPath, JSON.stringify(job), "utf8");
}

async function main() {
  const job = JSON.parse(await readFile(jobPath, "utf8")) as Job;
  job.pid = process.pid;
  job.status = "running";
  job.message = "Collecting panel data…";
  job.progress = { phase: "building", current: 0, total: 100 };
  await writeJob(job);
  await writeFile(lockPath, `${Date.now()}:${job.id}:${process.pid}`, "utf8");

  let lastWrite = 0;
  const onProgress = (phase: string, current: number, total: number) => {
    job.progress = { phase, current, total };
    if (phase === "streams") {
      job.message = `Exporting streams… ${current.toLocaleString()} / ${total.toLocaleString()}`;
    } else if (phase === "lines") {
      job.message = `Exporting lines… ${current.toLocaleString()} / ${total.toLocaleString()}`;
    } else if (phase === "serializing") {
      job.message = "Serializing backup…";
    } else if (phase === "writing" || phase === "encrypting") {
      job.message = phase === "encrypting" ? "Encrypting backup…" : "Writing backup file…";
    } else if (phase === "done") {
      job.message = "Backup complete.";
    } else {
      job.message = `Building backup… (${phase})`;
    }
    const now = Date.now();
    if (now - lastWrite > 400 || phase === "done" || current === total) {
      lastWrite = now;
      void writeJob(job);
    }
  };

  try {
    if (job.target === "remote") {
      // Still write a local copy so Backup & Restore can list/download it; remote sync is settings-driven.
      job.message = "Creating local backup (remote target keeps a local copy)…";
      await writeJob(job);
    }

    const result = await writePanelBackupFile({
      includePasswords: job.includePasswords,
      fullExport: true,
      format: job.format,
      onProgress,
    });

    job.status = "done";
    job.finishedAt = new Date().toISOString();
    job.path = result.path;
    job.checksum = result.checksum;
    job.size = result.size;
    job.message = `Backup written (${result.format})`;
    job.progress = { phase: "done", current: 100, total: 100 };
    await writeJob(job);
  } catch (e) {
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    job.error = e instanceof Error ? e.message : String(e);
    job.message = job.error;
    await writeJob(job);
    process.exitCode = 1;
  } finally {
    try {
      await unlink(lockPath);
    } catch {
      /* ignore */
    }
  }
}

main().catch(async (e) => {
  console.error(e);
  try {
    const job = JSON.parse(await readFile(jobPath, "utf8")) as Job;
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    job.error = e instanceof Error ? e.message : String(e);
    job.message = job.error;
    await writeJob(job);
  } catch {
    /* ignore */
  }
  try {
    await unlink(lockPath);
  } catch {
    /* ignore */
  }
  process.exit(1);
});
