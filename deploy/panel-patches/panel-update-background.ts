import path from "path";
import { getPanelServerSettings } from "../src/lib/panel-server";
import { runPanelUpdateWithProgress } from "../src/lib/panel-update";
import { readUpdateJob, writeUpdateJob, type PanelUpdateJob } from "../src/lib/panel-update-job";

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
  } catch {
    /* ignore */
  }
  process.exit(1);
});
