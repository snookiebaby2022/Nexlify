export type NexlifyReleaseChannel = "stable" | "rc" | "beta";

export type NexlifyRelease = {
  version: string;
  date: string;
  channel: NexlifyReleaseChannel;
  summary?: string;
  notes?: string[];
  changelog: string[];
  fixes: string[];
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
  const a = parseVersionParts(candidate);
  const b = parseVersionParts(installed);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}

export async function fetchNexlifyReleasesFeed(
  url: string = DEFAULT_RELEASES_FEED_URL,
): Promise<NexlifyReleasesFeed> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "nexlify-panel" },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Releases feed ${res.status}`);
  const data = (await res.json()) as NexlifyReleasesFeed;
  if (!Array.isArray(data.releases)) throw new Error("Invalid releases feed");
  return data;
}
