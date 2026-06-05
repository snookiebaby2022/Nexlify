import { readFile } from "fs/promises";
import path from "path";
import { spawn } from "child_process";

export type RemoteReleaseInfo = {
  tag: string;
  name: string;
  publishedAt: string;
  htmlUrl: string;
  body: string;
};

export type PanelVersionInfo = {
  installedVersion: string;
  packageName: string;
  gitBranch: string | null;
  gitCommit: string | null;
  gitDirty: boolean;
  remoteVersion: string | null;
  remoteError: string | null;
  isGitRepo: boolean;
  remoteRelease: RemoteReleaseInfo | null;
  updateAvailable: boolean;
};

function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || `git exit ${code}`));
    });
    child.on("error", reject);
  });
}

export async function readInstalledVersion(repoPath: string): Promise<{ version: string; name: string }> {
  const pkgPath = path.join(repoPath, "package.json");
  const raw = await readFile(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as { version?: string; name?: string };
  return { version: String(pkg.version ?? "0.0.0"), name: String(pkg.name ?? "nexlify") };
}

export async function getPanelVersionInfo(repoPath: string): Promise<PanelVersionInfo> {
  const { version, name } = await readInstalledVersion(repoPath);
  let gitBranch: string | null = null;
  let gitCommit: string | null = null;
  let gitDirty = false;
  let remoteVersion: string | null = null;
  let remoteError: string | null = null;
  let isGitRepo = false;

  try {
    await runGit(repoPath, ["rev-parse", "--is-inside-work-tree"]);
    isGitRepo = true;
    gitBranch = await runGit(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
    gitCommit = await runGit(repoPath, ["rev-parse", "--short", "HEAD"]);
    const status = await runGit(repoPath, ["status", "--porcelain"]);
    gitDirty = status.length > 0;
  } catch {
    isGitRepo = false;
  }

  if (isGitRepo) {
    try {
      const tag = await runGit(repoPath, ["describe", "--tags", "--abbrev=0"]);
      remoteVersion = tag || null;
    } catch {
      try {
        await runGit(repoPath, ["fetch", "--tags", "--quiet"]);
        const remote = await runGit(repoPath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
        const branch = remote.split("/").pop() || "main";
        const hash = await runGit(repoPath, ["rev-parse", "--short", `origin/${branch}`]);
        remoteVersion = `origin/${branch}@${hash}`;
      } catch (e) {
        remoteError = e instanceof Error ? e.message : "Could not check remote";
      }
    }
  }

  let remoteRelease: RemoteReleaseInfo | null = null;
  const checkUrl =
    process.env.PANEL_UPDATE_URL?.trim() ||
    process.env.GITHUB_RELEASES_URL?.trim() ||
    "";

  if (checkUrl) {
    try {
      remoteRelease = await fetchLatestRelease(checkUrl);
    } catch (e) {
      remoteError = remoteError ?? (e instanceof Error ? e.message : "Release check failed");
    }
  }

  const updateAvailable =
    remoteRelease != null &&
    remoteRelease.tag.replace(/^v/i, "") !== version.replace(/^v/i, "");

  return {
    installedVersion: version,
    packageName: name,
    gitBranch,
    gitCommit,
    gitDirty,
    remoteVersion: remoteRelease?.tag ?? remoteVersion,
    remoteError,
    isGitRepo,
    remoteRelease,
    updateAvailable,
  };
}

/** Fetch latest release from GitHub API URL or full releases/latest endpoint. */
export async function fetchLatestRelease(url: string): Promise<RemoteReleaseInfo> {
  const apiUrl = url.includes("api.github.com")
    ? url
    : url.replace(/\/$/, "") + "/releases/latest";

  const res = await fetch(apiUrl, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "nexlify-panel" },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Release API ${res.status}`);
  const data = (await res.json()) as {
    tag_name?: string;
    name?: string;
    published_at?: string;
    html_url?: string;
    body?: string;
  };
  return {
    tag: String(data.tag_name ?? "unknown"),
    name: String(data.name ?? data.tag_name ?? ""),
    publishedAt: String(data.published_at ?? ""),
    htmlUrl: String(data.html_url ?? ""),
    body: String(data.body ?? "").slice(0, 2000),
  };
}

export async function getPanelVersionInfoWithRelease(
  repoPath: string,
  updateCheckUrl?: string
): Promise<PanelVersionInfo> {
  const prev = process.env.PANEL_UPDATE_URL;
  if (updateCheckUrl) process.env.PANEL_UPDATE_URL = updateCheckUrl;
  try {
    return await getPanelVersionInfo(repoPath);
  } finally {
    if (updateCheckUrl) {
      if (prev) process.env.PANEL_UPDATE_URL = prev;
      else delete process.env.PANEL_UPDATE_URL;
    }
  }
}
