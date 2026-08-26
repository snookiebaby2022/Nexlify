/**
 * Detached SQL migration worker — survives `pm2 restart nexlify`.
 * Usage: npx tsx scripts/panel-migrate-background.ts /tmp/nexlify-migrate-job.json
 */
import { readFile, writeFile, unlink } from "fs/promises";
import { writeJsonAtomic } from "../src/lib/job-file-lock";
import { bundleFromSqlFile } from "../src/lib/panel-migration/map-rows";
import { previewMigrationBundle } from "../src/lib/panel-migration";
import { applyMigrationBundle } from "../src/lib/panel-migration/apply";
import type { MigrationSource } from "../src/lib/panel-migration/types";

const jobPath = process.argv[2] || "/tmp/nexlify-migrate-job.json";
const lockPath = "/tmp/nexlify-migrate-in-progress";

type Job = {
  id: string;
  status: "running" | "done" | "failed";
  dryRun: boolean;
  filePath: string;
  source: string;
  options: Record<string, unknown>;
  startedAt: string;
  finishedAt: string | null;
  message: string | null;
  progress: { phase: string; current: number; total: number } | null;
  preview?: unknown;
  result?: unknown;
  error?: string;
  pid?: number;
};

/** Serialized writes — concurrent progress updates must not share one .tmp path. */
let writeChain: Promise<void> = Promise.resolve();

async function writeJob(job: Job) {
  writeChain = writeChain.then(() => writeJsonAtomic(jobPath, job));
  await writeChain;
}

async function main() {
  const job = JSON.parse(await readFile(jobPath, "utf8")) as Job;
  job.pid = process.pid;
  job.status = "running";
  job.message = job.dryRun ? "Scanning dump for preview…" : "Scanning dump for import…";
  await writeJob(job);
  await writeFile(lockPath, `${Date.now()}:${job.id}:${process.pid}`, "utf8");

  let lastProgressWrite = 0;
  let pendingProgress: { phase: string; current: number; total: number } | null = null;
  let progressTimer: ReturnType<typeof setTimeout> | null = null;

  const flushProgress = () => {
    progressTimer = null;
    if (!pendingProgress) return;
    const { phase, current, total } = pendingProgress;
    pendingProgress = null;
    lastProgressWrite = Date.now();
    job.progress = { phase, current, total };
    job.message =
      phase === "scanning"
        ? `Scanning SQL dump… ${current}%`
        : phase === "done"
          ? "Import complete."
          : `Importing ${phase}: ${current}/${total}`;
    writeChain = writeChain.then(() => writeJsonAtomic(jobPath, job));
    void writeChain;
  };

  const onProgress = (phase: string, current: number, total: number) => {
    pendingProgress = { phase, current, total };
    const now = Date.now();
    // Throttle disk writes — unthrottled progress was rewriting the job file
    // thousands of times/sec and made status polling look stuck/empty.
    if (now - lastProgressWrite >= 500 || current >= total || phase === "scanning") {
      if (progressTimer) {
        clearTimeout(progressTimer);
        progressTimer = null;
      }
      flushProgress();
      return;
    }
    if (!progressTimer) {
      progressTimer = setTimeout(flushProgress, 500);
    }
  };

  try {
    let lastScan = -1;
    const bundle = await bundleFromSqlFile(
      job.filePath,
      job.source as MigrationSource,
      (bytesRead, totalBytes) => {
        const pct = Math.round((bytesRead / Math.max(1, totalBytes)) * 100);
        if (pct !== lastScan) {
          lastScan = pct;
          onProgress("scanning", pct, 100);
        }
      }
    );
    onProgress("scanning", 100, 100);

    const preview = previewMigrationBundle(bundle);
    if (Array.isArray(preview.warnings) && preview.warnings.length > 40) {
      preview.warnings = [
        ...preview.warnings.slice(0, 40),
        `… ${preview.warnings.length - 40} more warnings omitted`,
      ];
    }

    if (job.dryRun) {
      job.status = "done";
      job.finishedAt = new Date().toISOString();
      job.message = "Preview complete.";
      job.preview = preview;
      await writeJob(job);
      return;
    }

    job.message = `Parse complete — importing (${bundle.streams.length} streams, ${bundle.lines.length} lines)…`;
    await writeChain;
    await writeJob(job);

    const { dryRun: _dryRun, ...applyOpts } = job.options as Record<string, unknown>;
    void _dryRun;
    const result = await applyMigrationBundle(bundle, {
      ...(applyOpts as Parameters<typeof applyMigrationBundle>[1]),
      onProgress: (phase, current, total) => onProgress(phase, current, total),
    });
    if (Array.isArray(result.warnings) && result.warnings.length > 40) {
      result.warnings = [
        ...result.warnings.slice(0, 40),
        `… ${result.warnings.length - 40} more warnings omitted`,
      ];
    }

    job.status = "done";
    job.finishedAt = new Date().toISOString();
    job.message = "Import complete.";
    job.preview = preview;
    job.result = { ...result, appliedOptions: applyOpts };
    job.progress = { phase: "done", current: 1, total: 1 };
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
