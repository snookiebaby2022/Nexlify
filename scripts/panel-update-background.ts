import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
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
if (!process.env.PANEL_REPO_PATH) {
  process.env.PANEL_REPO_PATH = REPO_ROOT;
}

type ModuleNs = Record<string, unknown> & { default?: unknown };

async function importPanelFile(relPath: string): Promise<ModuleNs> {
  const abs = path.join(REPO_ROOT, relPath);
  return (await import(pathToFileURL(abs).href)) as ModuleNs;
}

/**
 * tsx sometimes compiles panel lib files as CJS. Dynamic import() then exposes
 * named exports only on `default`, so `const { foo } = await import(...)`
 * leaves `foo` undefined → "X is not a function".
 */
function namedExport<T>(mod: ModuleNs, name: string): T {
  const fromNs = mod[name];
  if (typeof fromNs === "function") return fromNs as T;
  const def = mod.default;
  if (def && typeof def === "object") {
    const fromDefault = (def as Record<string, unknown>)[name];
    if (typeof fromDefault === "function") return fromDefault as T;
  }
  const defaultKeys =
    def && typeof def === "object" ? Object.keys(def as object).join(", ") : typeof def;
  throw new Error(
    `${name} is not a function (module keys: ${Object.keys(mod).join(", ") || "(none)"}; default: ${defaultKeys})`
  );
}

async function spawnRecover(repoPath: string) {
  const script = path.join(repoPath, "scripts/panel-update-recover.sh");
  try {
    await access(script);
  } catch {
    return;
  }
  spawn("bash", [script], { cwd: repoPath, detached: true, stdio: "ignore", env: process.env }).unref();
}

function resolveJobRepoPath(
  resolvePanelRepoPathSync: (settingsRepoPath?: string) => string
): string {
  return resolvePanelRepoPathSync(process.env.PANEL_REPO_PATH || REPO_ROOT);
}

async function main() {
  const runPanelUpdateWithProgress = namedExport<
    (onProgress?: (update: Record<string, unknown>) => void | Promise<void>) => Promise<{
      ok: boolean;
      message: string;
      toVersion: string;
      steps: { name: string; ok: boolean; output?: string }[];
    }>
  >(await importPanelFile("src/lib/panel-update.ts"), "runPanelUpdateWithProgress");
  const jobMod = await importPanelFile("src/lib/panel-update-job.ts");
  const readUpdateJob = namedExport<(repoPath: string) => Promise<{
    status: string;
    progress: number;
    currentStep: string | null;
    [key: string]: unknown;
  } | null>>(jobMod, "readUpdateJob");
  const writeUpdateJob = namedExport<(repoPath: string, job: unknown) => Promise<void>>(
    jobMod,
    "writeUpdateJob"
  );
  const looksLikeSuccessfulUpdateDespiteWorkerExit = namedExport<(job: unknown) => boolean>(
    jobMod,
    "looksLikeSuccessfulUpdateDespiteWorkerExit"
  );
  const installedVersionImpliesUpdateSuccess = namedExport<
    (job: unknown, installedVersion: string | null) => boolean
  >(jobMod, "installedVersionImpliesUpdateSuccess");
  const repoMod = await importPanelFile("src/lib/panel-repo-path.ts");
  const resolvePanelRepoPathSync = namedExport<(settingsRepoPath?: string) => string>(
    repoMod,
    "resolvePanelRepoPathSync"
  );
  const { writeFile, unlink } = await import("fs/promises");

  const repoPath = resolveJobRepoPath(resolvePanelRepoPathSync);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let job: Awaited<ReturnType<typeof readUpdateJob>> = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    job = await readUpdateJob(repoPath);
    if (job?.status === "running") break;
    await sleep(400);
  }

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
    const jobMod = await importPanelFile("src/lib/panel-update-job.ts");
    const readUpdateJob = namedExport<(repoPath: string) => Promise<{
      status: string;
      progress: number;
      [key: string]: unknown;
    } | null>>(jobMod, "readUpdateJob");
    const writeUpdateJob = namedExport<(repoPath: string, job: unknown) => Promise<void>>(
      jobMod,
      "writeUpdateJob"
    );
    const repoMod = await importPanelFile("src/lib/panel-repo-path.ts");
    const resolvePanelRepoPathSync = namedExport<(settingsRepoPath?: string) => string>(
      repoMod,
      "resolvePanelRepoPathSync"
    );
    const repoPath = resolveJobRepoPath(resolvePanelRepoPathSync);
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
