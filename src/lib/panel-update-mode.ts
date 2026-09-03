/** Decide how a Linux panel applies a remote/auto update. */

export type PanelUpdateMode = "git" | "prebuilt" | "patch";

export function isPanelUpdateForced(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): boolean {
  const v = env.PANEL_UPDATE_FORCE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function preferTarballPanelUpdates(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  const v = env.PANEL_UPDATE_PREFER_TARBALL?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function preferGitPanelUpdates(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  const v = env.PANEL_UPDATE_PREFER_GIT?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** True only for a compiled Next build archive, not the source nexlify-panel.tar.gz. */
export function isNextBuildTarballUrl(url: string | null | undefined): boolean {
  return /(?:^|[/-])next-\d+\.\d+\.\d+\.tar\.gz(?:$|[?#])/i.test(String(url ?? ""));
}

/**
 * Published tarball is the marketed latest. origin/main is often a different commit
 * and a failed compile after git reset used to delete the running app (lasting 502).
 * Set PANEL_UPDATE_PREFER_GIT=1 to keep the old git-first path.
 */
export function choosePanelUpdateMode(opts: {
  isGitRepo: boolean;
  gitFetchOk?: boolean;
  hasPatchScript: boolean;
  hasPrebuiltDownload: boolean;
  hasNewerRelease: boolean;
}): PanelUpdateMode | null {
  const gitFirst = preferGitPanelUpdates() && !preferTarballPanelUpdates();
  if (!gitFirst) {
    if (opts.hasPrebuiltDownload && opts.hasNewerRelease) return "prebuilt";
    if (opts.hasPatchScript && opts.hasNewerRelease) return "patch";
  }
  if (opts.isGitRepo && opts.gitFetchOk !== false) return "git";
  if (opts.hasPrebuiltDownload && opts.hasNewerRelease) return "prebuilt";
  if (opts.hasPatchScript) return "patch";
  if (opts.isGitRepo && opts.gitFetchOk !== false) return "git";
  return null;
}
