/** Client-safe helpers for panel update progress UI (no Node.js imports). */

export const STEP_DURATION_HINTS: Record<string, string> = {
  "sync panel files": "~30s",
  "npm install": "1–3 min if dependencies changed",
  "npm install (skipped)": "skipped",
  "prisma db push": "~30s if schema changed",
  "prisma generate": "~20s",
  "prepare build": "~10s",
  "npm run build": "2–5 min — longest step",
  "prepare standalone": "~15s",
  "pm2 restart nexlify": "~15s",
  "git pull": "~30s",
};

export function formatUpdateElapsed(startedAt: string | null): string {
  if (!startedAt) return "";
  const ms = Date.now() - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

/** Map Next.js build stdout to 0–1 sub-progress within the build phase */
export function parseBuildSubProgress(line: string): { detail: string; ratio: number } | null {
  const t = line.trim();
  if (!t) return null;
  if (/Stopping nexlify|Pausing panel/i.test(t)) {
    return { detail: "Pausing live panel workers before build…", ratio: 0.02 };
  }
  if (/Building panel|Starting production/i.test(t)) {
    return { detail: "Starting production build…", ratio: 0.04 };
  }
  if (t.includes("Creating an optimized production build")) {
    return { detail: "Compiling TypeScript & React (this takes the longest)…", ratio: 0.12 };
  }
  if (t.includes("Compiled successfully")) {
    return { detail: "Compile finished — loading routes…", ratio: 0.38 };
  }
  if (t.includes("Collecting page data")) {
    return { detail: "Collecting server route data…", ratio: 0.48 };
  }
  const gen = t.match(/Generating static pages \((\d+)\/(\d+)\)/);
  if (gen) {
    const n = parseInt(gen[1] ?? "0", 10);
    const total = parseInt(gen[2] ?? "1", 10) || 1;
    return {
      detail: `Pre-rendering pages (${n}/${total})…`,
      ratio: 0.5 + (n / total) * 0.35,
    };
  }
  if (t.includes("Finalizing page optimization")) {
    return { detail: "Optimizing bundles & traces…", ratio: 0.9 };
  }
  if (/prepare-standalone|Copied static|verify-standalone/i.test(t)) {
    return { detail: "Packaging standalone server for PM2…", ratio: 0.96 };
  }
  if (/Build OK|CSS bundle/i.test(t)) {
    return { detail: "Build verification passed…", ratio: 0.99 };
  }
  return null;
}

const BUILD_PROGRESS_START = 50;
const BUILD_PROGRESS_END = 88;

export function progressDuringBuild(ratio: number): number {
  const r = Math.min(1, Math.max(0, ratio));
  return Math.round(BUILD_PROGRESS_START + (BUILD_PROGRESS_END - BUILD_PROGRESS_START) * r);
}

export const BUILD_STEP_PROGRESS_START = BUILD_PROGRESS_START;
export const BUILD_STEP_PROGRESS_END = BUILD_PROGRESS_END;
