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

/**
 * Git clones update from origin/main when fetch works.
 * When GitHub is private or fetch fails, fall back to nexlify.live tarball/patch scripts.
 */
export function choosePanelUpdateMode(opts: {
  isGitRepo: boolean;
  gitFetchOk?: boolean;
  hasPatchScript: boolean;
  hasPrebuiltDownload: boolean;
  hasNewerRelease: boolean;
}): PanelUpdateMode | null {
  if (preferTarballPanelUpdates()) {
    if (opts.hasPrebuiltDownload && opts.hasNewerRelease) return "prebuilt";
    if (opts.hasPatchScript) return "patch";
  }
  if (opts.isGitRepo && opts.gitFetchOk !== false) return "git";
  if (opts.hasPrebuiltDownload && opts.hasNewerRelease) return "prebuilt";
  if (opts.hasPatchScript) return "patch";
  if (opts.isGitRepo && opts.gitFetchOk !== false) return "git";
  return null;
}
