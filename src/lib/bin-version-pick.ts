import type { BinVersionOption } from "@/lib/bin-version-types";

function parseVersion(label: string, id: string): number {
  const fromLabel = label.match(/(\d+)\.(\d+)/);
  if (fromLabel) return Number(fromLabel[1]) * 100 + Number(fromLabel[2]);
  const bundled = id.match(/^bundled-(\d+)/);
  if (bundled) return Number(bundled[1]);
  const php = id.match(/^php(\d+)/);
  if (php) return Number(php[1]);
  return 0;
}

function pickBest(versions: BinVersionOption[], preferBundled = true): BinVersionOption | undefined {
  const found = versions.filter((v) => v.exists);
  if (!found.length) return versions[0];

  return [...found].sort((a, b) => {
    const bundledA = a.path.includes("/home/nexlify/") || a.id.startsWith("bundled") || a.id.startsWith("php");
    const bundledB = b.path.includes("/home/nexlify/") || b.id.startsWith("bundled") || b.id.startsWith("php");
    if (preferBundled && bundledA !== bundledB) return bundledB ? 1 : -1;
    return parseVersion(b.label, b.id) - parseVersion(a.label, a.id);
  })[0];
}

export function pickBestFfmpeg(versions: BinVersionOption[]): BinVersionOption | undefined {
  return pickBest(versions, true);
}

export function pickBestPhp(versions: BinVersionOption[]): BinVersionOption | undefined {
  return pickBest(versions, true);
}

export function resolveActiveSelection(
  versions: BinVersionOption[],
  activeId: string | undefined,
  pickBestFn: (v: BinVersionOption[]) => BinVersionOption | undefined
): { id: string; path: string } {
  if (activeId) {
    const hit = versions.find((v) => v.id === activeId);
    if (hit && hit.exists !== false) return { id: hit.id, path: hit.path };
  }
  const best = pickBestFn(versions);
  if (best) return { id: best.id, path: best.path };
  const fallback = versions[0];
  return { id: fallback?.id ?? "", path: fallback?.path ?? "" };
}
