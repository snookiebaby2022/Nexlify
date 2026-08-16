/** Decide how a Linux panel applies a remote/auto update. */

export type PanelUpdateMode = "git" | "prebuilt" | "patch";

export function isPanelUpdateForced(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): boolean {
  const v = env.PANEL_UPDATE_FORCE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Git clones always update from origin/main (GitHub is source of truth).
 * Vendor tarball/prebuilt is only for installs that are not git repos.
 * Stale nexlify.live must not block a git panel from pulling main.
 */
export function choosePanelUpdateMode(opts: {
  isGitRepo: boolean;
  gitFetchOk?: boolean;
  hasPatchScript: boolean;
  hasPrebuiltDownload: boolean;
  hasNewerRelease: boolean;
}): PanelUpdateMode | null {
  if (opts.isGitRepo && opts.gitFetchOk !== false) return "git";
  if (opts.hasPrebuiltDownload && opts.hasNewerRelease) return "prebuilt";
  if (opts.hasPatchScript) return "patch";
  if (opts.isGitRepo) return "git";
  return null;
}
