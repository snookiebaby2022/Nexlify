import path from "path";
import { spawn } from "child_process";
import { access } from "fs/promises";
import { getPanelServerSettings } from "../src/lib/panel-server";
import { runPanelUpdateWithProgress } from "../src/lib/panel-update";
import { readUpdateJob, writeUpdateJob, type PanelUpdateJob } from "../src/lib/panel-update-job";

async function spawnRecover(repoPath: string) {
  const script = path.join(repoPath, "scripts/panel-update-recover.sh");
  try {
    await access(script);
  } catch {
    return;
  }
  spawn("bash", [script], { cwd: repoPath, detached: true, stdio: "ignore", env: process.env }).unref();
}

async function main() {
  const server = await getPanelServerSettings();
  const repoPath = path.resolve(server.repoPath || process.cwd());
  let job = await readUpdateJob(repoPath);

  if (!job || job.status !== "running") {
    console.error("No running update job found");
    process.exit(1);
  }

  const result = await runPanelUpdateWithProgress(async (update) => {
    job = { ...job!, ...update } as PanelUpdateJob;
    await writeUpdateJob(repoPath, job);
  });

  await writeUpdateJob(repoPath, {
    ...job!,
    status: result.ok ? "done" : "failed",
    progress: 100,
    currentStep: null,
    finishedAt: new Date().toISOString(),
    message: result.message,
    toVersion: result.toVersion,
    steps: result.steps.map((s) => ({
      name: s.name,
      ok: s.ok,
      status: s.ok ? "done" : "failed",
      output: s.output,
    })),
  });

  if (!result.ok) {
    await spawnRecover(repoPath);
  }

  process.exit(result.ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  try {
    const server = await getPanelServerSettings();
    const repoPath = path.resolve(server.repoPath || process.cwd());
    const job = await readUpdateJob(repoPath);
    if (job) {
      await writeUpdateJob(repoPath, {
        ...job,
        status: "failed",
        progress: job.progress,
        currentStep: null,
        finishedAt: new Date().toISOString(),
        message: e instanceof Error ? e.message : "Update crashed",
      });
    }
    await spawnRecover(repoPath);
  } catch {
    /* ignore */
  }
  process.exit(1);
});
