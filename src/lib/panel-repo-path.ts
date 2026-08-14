import fs from "fs";
import path from "path";

export function isStandaloneBuildDir(dir: string): boolean {
  return dir.includes(`${path.sep}.next${path.sep}standalone`);
}

/** True when dir looks like the panel install root (not .next/standalone). */
export function isValidPanelRoot(dir: string): boolean {
  try {
    return (
      fs.existsSync(path.join(dir, "package.json")) &&
      fs.existsSync(path.join(dir, "scripts", "apply-panel-fast-update.sh")) &&
      fs.existsSync(path.join(dir, "scripts", "panel-update-background.ts")) &&
      fs.existsSync(path.join(dir, "src", "lib", "panel-server.ts"))
    );
  } catch {
    return false;
  }
}

/** Resolve install root from scripts/panel-update-background.ts location. */
export function resolveRepoRootFromScriptDir(scriptDir: string): string {
  const normalized = path.resolve(scriptDir);
  if (normalized.includes(`${path.sep}.next${path.sep}standalone`)) {
    return path.resolve(normalized, "..", "..", "..");
  }
  return path.resolve(normalized, "..");
}

/** Candidate panel roots — first valid install root wins. */
export function panelRepoPathCandidates(settingsRepoPath?: string): string[] {
  const candidates: string[] = [];
  const add = (p: string | undefined) => {
    const t = p?.trim();
    if (t && !candidates.includes(t)) candidates.push(t);
  };

  add(settingsRepoPath);
  add(process.env.PANEL_REPO_PATH);

  const cwd = process.cwd();
  if (isStandaloneBuildDir(cwd)) {
    add(path.join(cwd, "..", ".."));
  } else {
    add(cwd);
    add(path.join(cwd, ".."));
  }

  add("/home/nexlify");
  add("/home/nexlify-panel");
  add("/opt/nexlify-panel");
  return candidates;
}

export function resolvePanelRepoPathSync(settingsRepoPath?: string): string {
  const explicit = settingsRepoPath?.trim();
  if (explicit && isValidPanelRoot(explicit)) return explicit;

  for (const dir of panelRepoPathCandidates(settingsRepoPath)) {
    if (isStandaloneBuildDir(dir)) continue;
    if (isValidPanelRoot(dir)) return dir;
  }

  for (const dir of panelRepoPathCandidates(settingsRepoPath)) {
    if (isStandaloneBuildDir(dir)) continue;
    try {
      if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    } catch {
      /* skip */
    }
  }

  const envPath = process.env.PANEL_REPO_PATH?.trim();
  if (envPath && !isStandaloneBuildDir(envPath) && isValidPanelRoot(envPath)) return envPath;

  if (explicit && !isStandaloneBuildDir(explicit)) return explicit;

  const cwd = process.cwd();
  if (isStandaloneBuildDir(cwd)) {
    const parent = path.join(cwd, "..", "..");
    if (isValidPanelRoot(parent)) return parent;
  }
  if (isValidPanelRoot(cwd)) return cwd;
  return envPath || (isStandaloneBuildDir(explicit ?? "") ? path.join(cwd, "..", "..") : cwd);
}
