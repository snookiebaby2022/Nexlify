import { spawn } from "child_process";
import path from "path";
import {
  appendUpdateHistory,
  getPanelServerSettings,
  savePanelServerSettings,
} from "@/lib/panel-server";
import { getPanelVersionInfo, readInstalledVersion } from "@/lib/panel-version";

export type PanelUpdateResult = {
  ok: boolean;
  message: string;
  steps: { name: string; ok: boolean; output: string }[];
  fromVersion: string;
  toVersion: string;
};

function isLinux() {
  return process.platform === "linux";
}

function runCommand(
  cwd: string,
  command: string,
  args: string[]
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, windowsHide: true, env: process.env });
    let output = "";
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));
    child.on("close", (code) => resolve({ ok: code === 0, output: output.trim().slice(-4000) }));
    child.on("error", (err) => resolve({ ok: false, output: err.message }));
  });
}

async function gitRev(cwd: string): Promise<string | null> {
  const r = await runCommand(cwd, "git", ["rev-parse", "HEAD"]);
  return r.ok ? r.output.split("\n")[0]?.trim() || null : null;
}

const BUILD_STEPS: { name: string; command: string; args: string[] }[] = [
  { name: "npm install", command: "npm", args: ["install", "--no-audit", "--no-fund"] },
  { name: "prisma db push", command: "npx", args: ["prisma", "db", "push", "--skip-generate"] },
  { name: "prisma generate", command: "npx", args: ["prisma", "generate"] },
  { name: "npm run build", command: "npm", args: ["run", "build"] },
];

const UPDATE_STEPS: { name: string; command: string; args: string[] }[] = [
  { name: "git pull", command: "git", args: ["pull", "--ff-only"] },
  ...BUILD_STEPS,
];

export function panelUpdateManualSteps(repoPath: string): string[] {
  return [
    `cd "${repoPath}"`,
    "git pull --ff-only",
    "npm install",
    "npx prisma db push",
    "npx prisma generate",
    "npm run build",
    "pm2 restart nexlify   # or your process manager",
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

export async function runPanelUpdate(): Promise<PanelUpdateResult> {
  const settings = await getPanelServerSettings();
  const repoPath = path.resolve(settings.repoPath || process.cwd());
  const { version: fromVersion } = await readInstalledVersion(repoPath);

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

  const versionInfo = await getPanelVersionInfo(repoPath);
  if (!versionInfo.isGitRepo) {
    const msg = "This folder is not a git repository. Clone the panel repo or set a valid repo path in Server settings.";
    await recordResult(settings, false, msg, fromVersion, fromVersion, "update", []);
    return { ok: false, message: msg, steps: [], fromVersion, toVersion: fromVersion };
  }

  if (versionInfo.gitDirty) {
    const msg = "Working tree has uncommitted changes. Commit or stash before updating.";
    await recordResult(settings, false, msg, fromVersion, fromVersion, "update", []);
    return { ok: false, message: msg, steps: [], fromVersion, toVersion: fromVersion };
  }

  const preRef = await gitRev(repoPath);
  const steps: PanelUpdateResult["steps"] = [];
  for (const step of UPDATE_STEPS) {
    const result = await runCommand(repoPath, step.command, step.args);
    steps.push({ name: step.name, ok: result.ok, output: result.output });
    if (!result.ok) {
      const msg = `Update failed at step: ${step.name}`;
      await recordResult(settings, false, msg, fromVersion, fromVersion, "update", steps);
      return { ok: false, message: msg, steps, fromVersion, toVersion: fromVersion };
    }
  }

  const pm2 = await runCommand(repoPath, "pm2", ["restart", "nexlify", "--update-env"]);
  steps.push({ name: "pm2 restart nexlify", ok: pm2.ok, output: pm2.output });

  const { version: toVersion } = await readInstalledVersion(repoPath);
  const msg =
    toVersion !== fromVersion
      ? `Updated from v${fromVersion} to v${toVersion}. Panel restarted via PM2.`
      : `Update finished (still v${toVersion}). PM2 restart ${pm2.ok ? "completed" : "failed — restart manually"}.`;
  await recordResult(
    settings,
    true,
    msg,
    fromVersion,
    toVersion,
    "update",
    steps,
    preRef
  );
  return { ok: true, message: msg, steps, fromVersion, toVersion };
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

  for (const step of BUILD_STEPS) {
    const result = await runCommand(repoPath, step.command, step.args);
    steps.push({ name: step.name, ok: result.ok, output: result.output });
    if (!result.ok) {
      const msg = `Rollback rebuild failed at: ${step.name}`;
      await recordResult(settings, false, msg, fromVersion, fromVersion, "rollback", steps);
      return { ok: false, message: msg, steps, fromVersion, toVersion: fromVersion };
    }
  }

  const { version: toVersion } = await readInstalledVersion(repoPath);
  const msg = `Rolled back to commit ${ref.slice(0, 8)} (v${toVersion}). Restart PM2.`;
  await recordResult(settings, true, msg, fromVersion, toVersion, "rollback", steps);
  return { ok: true, message: msg, steps, fromVersion, toVersion };
}
