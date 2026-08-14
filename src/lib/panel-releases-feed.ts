import releasesJson from "./panel-releases.json";

export type NexlifyReleaseChannel = "stable" | "rc" | "beta";

export type NexlifyRelease = {
  version: string;
  date: string;
  channel: NexlifyReleaseChannel;
  summary?: string;
  notes?: string[];
  changelog: string[];
  fixes: string[];
  downloadUrl?: string;
};

export type NexlifyReleasesFeed = {
  source: string;
  latestVersion: string | null;
  releases: NexlifyRelease[];
};

export const DEFAULT_RELEASES_FEED_URL =
  process.env.NEXLIFY_RELEASES_URL?.trim() || "https://nexlify.live/api/panel-releases";

export function parseVersionParts(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(/[.\-+]/)
    .map((part) => {
      const n = parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

export function isVersionNewer(candidate: string, installed: string): boolean {
  return compareVersions(candidate, installed) > 0;
}

/** Positive if a is newer than b, negative if older, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const av = parseVersionParts(a);
  const bv = parseVersionParts(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i++) {
    const left = av[i] ?? 0;
    const right = bv[i] ?? 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  return 0;
}

export const GITHUB_RELEASES_FEED_URL =
  "https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/src/lib/panel-releases.json";

export const STATIC_RELEASES_FEED_URL = "https://nexlify.live/panel-releases.json";

function releaseScore(r: NexlifyRelease): number {
  return (r.changelog?.length ?? 0) + (r.fixes?.length ?? 0) + (r.downloadUrl ? 2 : 0) + (r.summary ? 1 : 0);
}

/** Union of feeds; newest semver wins for latestVersion. Stale nexlify.live must not hide GitHub/bundled releases. */
export function mergeReleasesFeeds(feeds: NexlifyReleasesFeed[]): NexlifyReleasesFeed {
  const byVersion = new Map<string, NexlifyRelease>();
  for (const feed of feeds) {
    for (const raw of feed.releases ?? []) {
      const version = String(raw.version ?? "").replace(/^v/i, "");
      if (!version) continue;
      const next = { ...raw, version };
      const existing = byVersion.get(version);
      if (!existing || releaseScore(next) >= releaseScore(existing)) {
        byVersion.set(version, next);
      }
    }
  }
  const releases = [...byVersion.values()].sort((a, b) => compareVersions(b.version, a.version));
  const latestFromFeeds = feeds
    .map((f) => f.latestVersion)
    .filter((v): v is string => Boolean(v));
  let latestVersion = releases[0]?.version ?? null;
  for (const candidate of latestFromFeeds) {
    if (!latestVersion || compareVersions(candidate, latestVersion) > 0) {
      latestVersion = candidate.replace(/^v/i, "");
    }
  }
  if (latestVersion && releases[0] && compareVersions(releases[0].version, latestVersion) > 0) {
    latestVersion = releases[0].version;
  }
  return {
    source: "nexlify-merged",
    latestVersion,
    releases,
  };
}

/** Accept canonical panel feed or legacy marketing feed (changes/title/description). */
export function normalizeReleasesFeed(
  data: NexlifyReleasesFeed & { releases?: Array<Record<string, unknown>> }
): NexlifyReleasesFeed {
  const releases = (data.releases ?? []).map((raw) => normalizeRelease(raw));
  return {
    source: data.source ?? "nexlify",
    latestVersion: data.latestVersion ?? releases[0]?.version ?? null,
    releases,
  };
}

function normalizeRelease(raw: Record<string, unknown>): NexlifyRelease {
  const version = String(raw.version ?? "0.0.0");
  const date = String(raw.date ?? "");
  const channel = (raw.channel as NexlifyReleaseChannel | undefined) ?? "stable";

  if (Array.isArray(raw.changelog)) {
    return {
      version,
      date,
      channel,
      summary: typeof raw.summary === "string" ? raw.summary : undefined,
      notes: Array.isArray(raw.notes) ? raw.notes.map(String) : undefined,
      changelog: raw.changelog.map(String),
      fixes: Array.isArray(raw.fixes) ? raw.fixes.map(String) : [],
      downloadUrl: typeof raw.downloadUrl === "string" ? raw.downloadUrl : undefined,
    };
  }

  const changes = Array.isArray(raw.changes) ? raw.changes.map(String) : [];
  const notesFromChanges = changes
    .filter((c) => c.startsWith("Note: "))
    .map((c) => c.slice(6).trim());
  const changelog = changes.filter((c) => !c.startsWith("Note: "));
  const fixes = changelog.filter((c) => /^fix\b/i.test(c) || c.toLowerCase().includes(" fix "));
  const features = changelog.filter((c) => !fixes.includes(c));

  return {
    version,
    date,
    channel,
    summary:
      typeof raw.description === "string"
        ? raw.description
        : typeof raw.summary === "string"
          ? raw.summary
          : undefined,
    notes:
      notesFromChanges.length > 0
        ? notesFromChanges
        : Array.isArray(raw.notes)
          ? raw.notes.map(String)
          : undefined,
    changelog: features.length ? features : changelog,
    fixes,
    downloadUrl: typeof raw.downloadUrl === "string" ? raw.downloadUrl : undefined,
  };
}

function bundledFeed(): NexlifyReleasesFeed {
  return normalizeReleasesFeed(releasesJson as Parameters<typeof normalizeReleasesFeed>[0]);
}

async function fetchFeedJson(url: string): Promise<NexlifyReleasesFeed | null> {
  const browserUa =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": browserUa };
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  if (token && url.includes("githubusercontent.com")) {
    headers.Authorization = `Bearer ${token}`;
  }
  const sep = url.includes("?") ? "&" : "?";
  try {
    const res = await fetch(`${url}${sep}cb=${Date.now()}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NexlifyReleasesFeed & {
      releases?: Array<Record<string, unknown>>;
    };
    if (!Array.isArray(data.releases)) return null;
    return normalizeReleasesFeed(data);
  } catch {
    return null;
  }
}

export async function fetchNexlifyReleasesFeed(
  url: string = DEFAULT_RELEASES_FEED_URL,
): Promise<NexlifyReleasesFeed> {
  const urls = [...new Set([url, DEFAULT_RELEASES_FEED_URL, STATIC_RELEASES_FEED_URL, GITHUB_RELEASES_FEED_URL])];
  const remote = await Promise.all(urls.map((u) => fetchFeedJson(u)));
  const feeds = remote.filter((f): f is NexlifyReleasesFeed => Boolean(f));
  feeds.push(bundledFeed());
  return mergeReleasesFeeds(feeds);
}
