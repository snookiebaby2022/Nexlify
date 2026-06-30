import releasesJson from "./panel-releases.json";

export type UpdateEntry = {
  version: string;
  date: string;
  title: string;
  description: string;
  changes: string[];
};

type PanelRelease = {
  version: string;
  date: string;
  summary?: string;
  changelog?: string[];
  fixes?: string[];
  notes?: string[];
};

const feed = releasesJson as { releases: PanelRelease[] };

function toUpdateEntry(r: PanelRelease): UpdateEntry {
  const changes = [...(r.changelog ?? []), ...(r.fixes ?? [])];
  if (r.notes?.length) changes.push(...r.notes.map((n) => `Note: ${n}`));
  return {
    version: r.version,
    date: r.date,
    title: `v${r.version}`,
    description: r.summary ?? "",
    changes: changes.length ? changes : ["See changelog on the panel admin Updates page."],
  };
}

export const PANEL_RELEASES: UpdateEntry[] = feed.releases.map(toUpdateEntry);
export const UPDATES = PANEL_RELEASES;

export function getUpdates(): UpdateEntry[] {
  return UPDATES;
}

export function getLatestUpdate(): UpdateEntry | null {
  return UPDATES[0] ?? null;
}
