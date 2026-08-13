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

export async function fetchNexlifyReleasesFeed(
  url: string = DEFAULT_RELEASES_FEED_URL,
): Promise<NexlifyReleasesFeed> {
  const browserUa =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": browserUa },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Releases feed ${res.status}`);
    const data = (await res.json()) as NexlifyReleasesFeed & {
      releases?: Array<Record<string, unknown>>;
    };
    if (!Array.isArray(data.releases)) throw new Error("Invalid releases feed");
    return normalizeReleasesFeed(data);
  } catch {
    // Cloudflare/datacenter blocks are common — use bundled feed so update checks still work.
    return bundledFeed();
  }
}
