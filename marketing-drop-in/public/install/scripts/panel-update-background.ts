import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { access } from "fs/promises";

function resolveRepoRootFromScriptDir(scriptDir: string): string {
  const normalized = path.resolve(scriptDir);
  if (normalized.includes(`${path.sep}.next${path.sep}standalone`)) {
    return path.resolve(normalized, "..", "..", "..");
  }
  return path.resolve(normalized, "..");
}

const REPO_ROOT = resolveRepoRootFromScriptDir(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(REPO_ROOT);

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
  const { getPanelServerSettingsSafe } = await import(
    path.join(REPO_ROOT, "src/lib/panel-server.ts")
  );
  const { runPanelUpdateWithProgress } = await import(
    path.join(REPO_ROOT, "src/lib/panel-update.ts")
  );
  const { readUpdateJob, writeUpdateJob, looksLikeSuccessfulUpdateDespiteWorkerExit, installedVersionImpliesUpdateSuccess } = await import(
    path.join(REPO_ROOT, "src/lib/panel-update-job.ts")
  );
  const { resolvePanelRepoPathSync } = await import(
    path.join(REPO_ROOT, "src/lib/panel-repo-path.ts")
  );
  const { writeFile, unlink } = await import("fs/promises");

  const server = await getPanelServerSettingsSafe();
  const repoPath = resolvePanelRepoPathSync(server.repoPath);
  let job = await readUpdateJob(repoPath);

  if (!job || job.status !== "running") {
    console.error("No running update job found");
    process.exit(1);
  }

  try {
    await writeFile(path.join(repoPath, ".update-in-progress"), String(process.pid), "utf8");
  } catch {
    /* ignore */
  }

  const result = await runPanelUpdateWithProgress(async (update: Record<string, unknown>) => {
    job = { ...job!, ...update } as typeof job;
    await writeUpdateJob(repoPath, job!);
  });

  // Prefer success when the worker got far enough that PM2 swap/restart already applied the build,
  // even if a late step returned ok:false (transient static check / restart race).
  const { readFile } = await import("fs/promises");
  let installedVersion: string | null = null;
  try {
    const pkg = JSON.parse(await readFile(path.join(repoPath, "package.json"), "utf8")) as {
      version?: string;
    };
    installedVersion = pkg.version?.trim() || null;
  } catch {
    /* ignore */
  }
  const lateSuccess =
    !result.ok &&
    (looksLikeSuccessfulUpdateDespiteWorkerExit({
      ...job!,
      progress: Math.max(job!.progress ?? 0, result.ok ? 100 : job!.progress ?? 0),
      steps: result.steps.map((s: { name: string; ok: boolean; output?: string }) => ({
        name: s.name,
        ok: s.ok,
        status: s.ok ? ("done" as const) : ("failed" as const),
        output: s.output,
      })),
      currentStep: job!.currentStep,
    }) ||
      installedVersionImpliesUpdateSuccess(
        {
          ...job!,
          toVersion: result.toVersion || job!.toVersion,
        },
        installedVersion
      ));

  const finalStatus = result.ok || lateSuccess ? "done" : "failed";
  await writeUpdateJob(repoPath, {
    ...job!,
    status: finalStatus,
    progress: 100,
    currentStep: null,
    finishedAt: new Date().toISOString(),
    message: lateSuccess
      ? result.message?.includes("Updated")
        ? result.message
        : `Updated to v${result.toVersion}. Panel restarted (a late restart check failed but the new build is live).`
      : result.message,
    toVersion: result.toVersion,
    steps: result.steps.map((s: { name: string; ok: boolean; output?: string }) => ({
      name: s.name,
      ok: s.ok,
      status: s.ok ? ("done" as const) : ("failed" as const),
      output: s.output,
    })),
  });

  try {
    await unlink(path.join(repoPath, ".update-in-progress"));
  } catch {
    /* ignore */
  }

  if (!result.ok && !lateSuccess) {
    await spawnRecover(repoPath);
  }

  process.exit(result.ok || lateSuccess ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  try {
    const { getPanelServerSettingsSafe } = await import(
      path.join(REPO_ROOT, "src/lib/panel-server.ts")
    );
    const { readUpdateJob, writeUpdateJob } = await import(
      path.join(REPO_ROOT, "src/lib/panel-update-job.ts")
    );
    const { resolvePanelRepoPathSync } = await import(
      path.join(REPO_ROOT, "src/lib/panel-repo-path.ts")
    );
    const server = await getPanelServerSettingsSafe();
    const repoPath = resolvePanelRepoPathSync(server.repoPath);
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
    try {
      const { unlink } = await import("fs/promises");
      await unlink(path.join(repoPath, ".update-in-progress"));
    } catch {
      /* ignore */
    }
    await spawnRecover(repoPath);
  } catch {
    /* ignore */
  }
  process.exit(1);
});
