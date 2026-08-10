import fs from "fs";
import path from "path";

/** Candidate panel roots — first dir containing package.json wins. */
export function panelRepoPathCandidates(settingsRepoPath?: string): string[] {
  const candidates: string[] = [];
  const add = (p: string | undefined) => {
    const t = p?.trim();
    if (t && !candidates.includes(t)) candidates.push(t);
  };

  add(settingsRepoPath);
  add(process.env.PANEL_REPO_PATH);

  const cwd = process.cwd();
  add(cwd);
  add(path.join(cwd, ".."));
  add(path.join(cwd, "../.."));

  // Standalone PM2 cwd is .next/standalone — package.json is copied here on build.
  if (cwd.includes(`${path.sep}.next${path.sep}standalone`)) {
    add(path.join(cwd, "..", ".."));
  }

  add("/home/nexlify-panel");
  return candidates;
}

export function resolvePanelRepoPathSync(settingsRepoPath?: string): string {
  for (const dir of panelRepoPathCandidates(settingsRepoPath)) {
    try {
      if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    } catch {
      /* skip unreadable paths */
    }
  }
  return (
    settingsRepoPath?.trim() ||
    process.env.PANEL_REPO_PATH?.trim() ||
    process.cwd()
  );
}
