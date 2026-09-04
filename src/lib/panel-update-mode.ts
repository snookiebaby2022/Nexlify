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

/** Compiled archives the customer updater may download for a numbered release. */
export function prebuiltTarballUrlsForVersion(
  version: string,
  feedDownloadUrl?: string | null,
): string[] {
  const v = version.replace(/^v/i, "").trim();
  if (!/^\d+\.\d+\.\d+/.test(v)) return [];
  const urls: string[] = [];
  if (feedDownloadUrl && isNextBuildTarballUrl(feedDownloadUrl)) {
    urls.push(feedDownloadUrl);
  }
  const rewritten = String(feedDownloadUrl ?? "").replace(
    /nexlify-panel\.tar\.gz(\?[^#]*)?$/i,
    `next-${v}.tar.gz$1`,
  );
  if (rewritten && isNextBuildTarballUrl(rewritten)) urls.push(rewritten);
  urls.push(`https://nexlify.live/downloads/next-${v}.tar.gz`);
  return [...new Set(urls)];
}

export function allowCompilePanelUpdates(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  if (preferGitPanelUpdates(env)) return true;
  const v = env.PANEL_UPDATE_ALLOW_COMPILE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
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
  /** When false, a numbered newer release will not git-reset or compile on the VPS. */
  allowCompile?: boolean;
}): PanelUpdateMode | null {
  const gitFirst = preferGitPanelUpdates() && !preferTarballPanelUpdates();
  const allowCompile = opts.allowCompile ?? true;
  if (!gitFirst) {
    if (opts.hasPrebuiltDownload && opts.hasNewerRelease) return "prebuilt";
    if (opts.hasNewerRelease && !allowCompile) return null;
    if (opts.hasPatchScript && opts.hasNewerRelease) return "patch";
  }
  if (opts.hasNewerRelease && !allowCompile && !opts.hasPrebuiltDownload) return null;
  if (opts.isGitRepo && opts.gitFetchOk !== false) return "git";
  if (opts.hasPrebuiltDownload && opts.hasNewerRelease) return "prebuilt";
  if (opts.hasPatchScript) return "patch";
  if (opts.isGitRepo && opts.gitFetchOk !== false) return "git";
  return null;
}
