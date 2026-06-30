import type { NexlifyReleasesFeed } from "@/lib/panel-releases-feed";
import releasesJson from "./panel-releases.json";

/** Single source of truth for panel + website release notes. Sync via scripts/sync-releases-to-website.mjs */
export const PANEL_RELEASES_FEED = releasesJson as NexlifyReleasesFeed;

export function getReleaseForVersion(version: string) {
  const v = version.replace(/^v/i, "");
  return PANEL_RELEASES_FEED.releases.find((r) => r.version.replace(/^v/i, "") === v) ?? null;
}
