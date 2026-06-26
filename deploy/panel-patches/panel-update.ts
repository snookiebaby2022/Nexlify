import { access } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import {
  appendUpdateHistory,
  getPanelServerSettings,
  savePanelServerSettings,
} from "@/lib/panel-server";
import { lockfileChanged, schemaChanged, writeUpdateCache } from "@/lib/panel-update-cache";
import { progressForStep, type PanelUpdateJob } from "@/lib/panel-update-job";
import { getPanelVersionInfo, readInstalledVersion } from "@/lib/panel-version";

export type UpdateProgressCallback = (update: Partial<PanelUpdateJob>) => void | Promise<void>;

export type PanelUpdateResult = {
  ok: boolean;
  message: string;
  steps: { name: string; ok: boolean; output: string }[];
  fromVersion: string;
  toVersion: string;
};

type UpdateStep = { name: string; command: string; args: string[] };

function isLinux() {
  return process.platform === "linux";
}

const STEP_TIMEOUT_MS: Record<string, number> = {
  "npm install": 20 * 60 * 1000,
  "npm run build": 25 * 60 * 1000,
  "sync panel files": 5 * 60 * 1000,
};

function runCommand(
  cwd: string,
  command: string,
  args: string[],
  stepName?: string
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, windowsHide: true, env: process.env });
    let output = "";
    let settled = false;
    const finish = (ok: boolean, text: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok, output: text.trim().slice(-4000) });
    };
    const timeoutMs = stepName ? STEP_TIMEOUT_MS[stepName] ?? 10 * 60 * 1000 : 10 * 60 * 1000;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref?.();
      finish(false, `${output}\n\nTimed out after ${Math.round(timeoutMs / 60000)} minutes`);
    }, timeoutMs);
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));
    child.on("close", (code) => finish(code === 0, output));
    child.on("error", (err) => finish(false, err.message));
  });
}

async function gitRev(cwd: string): Promise<string | null> {
  const r = await runCommand(cwd, "git", ["rev-parse", "HEAD"]);
  return r.ok ? r.output.split("\n")[0]?.trim() || null : null;
}

async function npmInstallStep(repoPath: string): Promise<UpdateStep> {
  const fs = await import("fs/promises");
  try {
    await fs.access(path.join(repoPath, "package-lock.json"));
    return {
      name: "npm install",
      command: "npm",
      args: ["ci", "--no-audit", "--no-fund", "--include=dev", "--prefer-offline"],
    };
  } catch {
    return {
      name: "npm install",
      command: "npm",
      args: ["install", "--no-audit", "--no-fund", "--include=dev", "--prefer-offline"],
    };
  }
}

const BUILD_STEPS_BASE: UpdateStep[] = [
  { name: "prisma db push", command: "npx", args: ["prisma", "db", "push", "--skip-generate"] },
  { name: "prisma generate", command: "npx", args: ["prisma", "generate"] },
  { name: "npm run build", command: "npm", args: ["run", "build"] },
];

async function buildSteps(repoPath: string, skipNpm = false): Promise<UpdateStep[]> {
  const steps: UpdateStep[] = [];
  if (!skipNpm) steps.push(await npmInstallStep(repoPath));
  steps.push(...BUILD_STEPS_BASE);
  return steps;
}

/** VPS patch deploys ship updates via /var/www/nexlify/deploy/panel-patches (no git pull). */
export async function resolvePatchUpdateScript(repoPath: string): Promise<string | null> {
  const candidates = [
    process.env.PANEL_PATCH_UPDATE_SCRIPT?.trim(),
    "/var/www/nexlify/deploy/panel-patches/apply-panel-fast-update.sh",
    path.join(repoPath, "../nexlify/deploy/panel-patches/apply-panel-fast-update.sh"),
  ].filter((p): p is string => Boolean(p));

  for (const script of candidates) {
    try {
      await access(script);
      return script;
    } catch {
      /* try next */
    }
  }
  return null;
}

export function panelUpdateManualSteps(repoPath: string): string[] {
  return [
    `cd "${repoPath}"`,
    "# Patch VPS (fast — skips npm when lockfile unchanged):",
    "bash /var/www/nexlify/deploy/panel-patches/apply-panel-fast-update.sh",
    "# Or git-based install:",
    "git pull --ff-only",
    "npm ci --include=dev",
    "npx prisma db push",
    "npx prisma generate",
    "npm run build",
    "pm2 restart nexlify",
  ];
}

async function recordResult(
  settings: Awaited<ReturnType<typeof getPanelServerSettings>>,
  ok: boolean,
  message: string,
  fromVersion: string,
  toVersion: string,
  action: "update" | "rollback",
  steps: PanelUpdateResult["steps"],
  rollbackGitRef?: string | null
) {
  let next = appendUpdateHistory(settings, {
    ok,
    message,
    fromVersion,
    toVersion,
    action,
    steps: steps.length ? steps : undefined,
  });
  if (rollbackGitRef !== undefined) {
    next = { ...next, rollbackGitRef };
  }
  await savePanelServerSettings(next);
}

async function reportProgress(
  onProgress: UpdateProgressCallback | undefined,
  update: Partial<PanelUpdateJob>
) {
  if (onProgress) await onProgress(update);
}

async function runSteps(
  repoPath: string,
  steps: UpdateStep[],
  onProgress: UpdateProgressCallback | undefined,
  jobSteps: PanelUpdateJob["steps"],
  resultSteps: PanelUpdateResult["steps"]
): Promise<boolean> {
  for (const step of steps) {
    await reportProgress(onProgress, {
      currentStep: step.name,
      progress: progressForStep(step.name) - 2,
      steps: [...jobSteps, { name: step.name, ok: false, status: "running" }],
    });
    const result = await runCommand(repoPath, step.command, step.args, step.name);
    resultSteps.push({ name: step.name, ok: result.ok, output: result.output });
    jobSteps.push({
      name: step.name,
      ok: result.ok,
      status: result.ok ? "done" : "failed",
      output: result.output,
    });
    await reportProgress(onProgress, {
      currentStep: result.ok ? null : step.name,
      progress: progressForStep(step.name),
      steps: [...jobSteps],
    });
    if (!result.ok) return false;
  }
  return true;
}

function patchUpdateSteps(patchScript: string): UpdateStep[] {
  return [
    { name: "sync panel files", command: "bash", args: [patchScript, "sync"] },
    { name: "npm install", command: "bash", args: [patchScript, "deps"] },
    { name: "prisma db push", command: "bash", args: [patchScript, "prisma"] },
    { name: "npm run build", command: "bash", args: [patchScript, "build"] },
    { name: "pm2 restart nexlify", command: "bash", args: [patchScript, "restart"] },
  ];
}

async function postPullBuildSteps(repoPath: string): Promise<UpdateStep[]> {
  const steps: UpdateStep[] = [];
  if (await lockfileChanged(repoPath)) {
    steps.push(await npmInstallStep(repoPath));
  } else {
    steps.push({
      name: "npm install (skipped)",
      command: "bash",
      args: ["-c", "echo lockfile unchanged — skipping npm ci"],
    });
  }

  if (await schemaChanged(repoPath)) {
    steps.push(
      { name: "prisma db push", command: "npx", args: ["prisma", "db", "push", "--skip-generate"] },
      { name: "prisma generate", command: "npx", args: ["prisma", "generate"] }
    );
  } else {
    const fs = await import("fs/promises");
    try {
      await fs.access(path.join(repoPath, "node_modules/.prisma/client"));
      steps.push({
        name: "prisma (skipped)",
        command: "bash",
        args: ["-c", "echo schema unchanged — skipping prisma"],
      });
    } catch {
      steps.push({ name: "prisma generate", command: "npx", args: ["prisma", "generate"] });
    }
  }

  steps.push({ name: "npm run build", command: "npm", args: ["run", "build"] });
  return steps;
}

export async function runPanelUpdateWithProgress(
  onProgress?: UpdateProgressCallback
): Promise<PanelUpdateResult> {
  const settings = await getPanelServerSettings();
  const repoPath = path.resolve(settings.repoPath || process.cwd());
  const { version: fromVersion } = await readInstalledVersion(repoPath);
  const jobSteps: PanelUpdateJob["steps"] = [];

  if (!isLinux()) {
    const msg =
      "Automatic panel updates run on Linux VPS only. On Windows/dev, run the manual steps below in your repo folder.";
    await recordResult(settings, false, msg, fromVersion, fromVersion, "update", []);
    return {
      ok: false,
      message: msg,
      steps: [],
      fromVersion,
      toVersion: fromVersion,
    };
  }

  const patchScript = await resolvePatchUpdateScript(repoPath);
  const versionInfo = await getPanelVersionInfo(repoPath);
  const preRef = patchScript ? null : await gitRev(repoPath);
  const steps: PanelUpdateResult["steps"] = [];

  if (!patchScript && !versionInfo.isGitRepo) {
    const msg =
      "This folder is not a git repository. Clone the panel repo, set a valid repo path, or deploy patch scripts to /var/www/nexlify/deploy/panel-patches/.";
    await recordResult(settings, false, msg, fromVersion, fromVersion, "update", []);
    return { ok: false, message: msg, steps: [], fromVersion, toVersion: fromVersion };
  }

  if (!patchScript && versionInfo.gitDirty) {
    const stepName = "git stash local changes";
    await reportProgress(onProgress, {
      currentStep: stepName,
      progress: progressForStep(stepName),
      steps: [...jobSteps, { name: stepName, ok: false, status: "running" }],
    });
    const stash = await runCommand(repoPath, "git", [
      "stash",
      "push",
      "-u",
      "-m",
      `nexlify-pre-update-${Date.now()}`,
    ]);
    steps.push({ name: stepName, ok: stash.ok, output: stash.output });
    jobSteps.push({ name: stepName, ok: stash.ok, status: stash.ok ? "done" : "failed", output: stash.output });
    await reportProgress(onProgress, {
      currentStep: stash.ok ? null : stepName,
      progress: progressForStep(stepName),
      steps: [...jobSteps],
    });
    if (!stash.ok) {
      const msg = `Update failed at step: ${stepName}`;
      await recordResult(settings, false, msg, fromVersion, fromVersion, "update", steps);
      return { ok: false, message: msg, steps, fromVersion, toVersion: fromVersion };
    }
  }

  let ok: boolean;
  if (patchScript) {
    ok = await runSteps(repoPath, patchUpdateSteps(patchScript), onProgress, jobSteps, steps);
  } else {
    ok = await runSteps(
      repoPath,
      [{ name: "git pull", command: "git", args: ["pull", "--ff-only"] }],
      onProgress,
      jobSteps,
      steps
    );
    if (ok) {
      ok = await runSteps(repoPath, await postPullBuildSteps(repoPath), onProgress, jobSteps, steps);
    }
    if (ok) {
      const pm2Name = "pm2 restart nexlify";
      await reportProgress(onProgress, {
        currentStep: pm2Name,
        progress: progressForStep(pm2Name) - 2,
        steps: [...jobSteps, { name: pm2Name, ok: false, status: "running" }],
      });
      const pm2 = await runCommand(repoPath, "pm2", ["restart", "nexlify", "--update-env"]);
      steps.push({ name: pm2Name, ok: pm2.ok, output: pm2.output });
      jobSteps.push({ name: pm2Name, ok: pm2.ok, status: pm2.ok ? "done" : "failed", output: pm2.output });
      ok = pm2.ok;
    }
  }
  if (!ok) {
    const failed = steps[steps.length - 1]?.name ?? "unknown";
    const msg = `Update failed at step: ${failed}`;
    await recordResult(settings, false, msg, fromVersion, fromVersion, "update", steps);
    return { ok: false, message: msg, steps, fromVersion, toVersion: fromVersion };
  }

  await writeUpdateCache(repoPath);

  const { version: toVersion } = await readInstalledVersion(repoPath);
  const mode = patchScript ? "patch" : "git";
  const msg =
    toVersion !== fromVersion
      ? `Updated from v${fromVersion} to v${toVersion} (${mode}). Panel restarted via PM2.`
      : `Update finished (still v${toVersion}, ${mode} mode). PM2 restart completed.`;
  await recordResult(settings, true, msg, fromVersion, toVersion, "update", steps, preRef);
  return { ok: true, message: msg, steps, fromVersion, toVersion };
}

export async function runPanelUpdate(): Promise<PanelUpdateResult> {
  return runPanelUpdateWithProgress();
}

export async function runPanelRollback(): Promise<PanelUpdateResult> {
  const settings = await getPanelServerSettings();
  const repoPath = path.resolve(settings.repoPath || process.cwd());
  const { version: fromVersion } = await readInstalledVersion(repoPath);
  const ref = settings.rollbackGitRef;

  if (!ref) {
    const msg = "No rollback point saved. Run a successful update first (stores the pre-update git commit).";
    await recordResult(settings, false, msg, fromVersion, fromVersion, "rollback", []);
    return { ok: false, message: msg, steps: [], fromVersion, toVersion: fromVersion };
  }

  if (!isLinux()) {
    const msg = "Automatic rollback runs on Linux VPS only. Manually: git reset --hard <commit> then rebuild.";
    await recordResult(settings, false, msg, fromVersion, fromVersion, "rollback", []);
    return { ok: false, message: msg, steps: [], fromVersion, toVersion: fromVersion };
  }

  const steps: PanelUpdateResult["steps"] = [];
  const reset = await runCommand(repoPath, "git", ["reset", "--hard", ref]);
  steps.push({ name: `git reset --hard ${ref.slice(0, 8)}`, ok: reset.ok, output: reset.output });
  if (!reset.ok) {
    const msg = "Rollback failed at git reset.";
    await recordResult(settings, false, msg, fromVersion, fromVersion, "rollback", steps);
    return { ok: false, message: msg, steps, fromVersion, toVersion: fromVersion };
  }

  const skipNpm = !(await lockfileChanged(repoPath));
  for (const step of await buildSteps(repoPath, skipNpm)) {
    const result = await runCommand(repoPath, step.command, step.args, step.name);
    steps.push({ name: step.name, ok: result.ok, output: result.output });
    if (!result.ok) {
      const msg = `Rollback rebuild failed at: ${step.name}`;
      await recordResult(settings, false, msg, fromVersion, fromVersion, "rollback", steps);
      return { ok: false, message: msg, steps, fromVersion, toVersion: fromVersion };
    }
  }

  await writeUpdateCache(repoPath);
  const { version: toVersion } = await readInstalledVersion(repoPath);
  const msg = `Rolled back to commit ${ref.slice(0, 8)} (v${toVersion}). Restart PM2.`;
  await recordResult(settings, true, msg, fromVersion, toVersion, "rollback", steps);
  return { ok: true, message: msg, steps, fromVersion, toVersion };
}
