/** Client-safe helpers for panel update progress UI (no Node.js imports). */

export const STEP_DURATION_HINTS: Record<string, string> = {
  "sync panel files": "~30s",
  "npm install": "1–3 min if dependencies changed",
  "npm install (skipped)": "skipped",
  "prisma db push": "~30s if schema changed",
  "prisma generate": "~20s",
  "prepare build": "~10s",
  "npm run build": "5–15 min — longest step; bar may sit mid-compile while webpack runs",
  "prepare standalone": "~15s",
  "pm2 restart nexlify": "~15s",
  "git pull": "~30s (fails after ~90s if hung)",
  "download update": "~15s",
  "extract update": "~10s",
  "apply update": "~30s",
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
    return {
      detail: "Compiling TypeScript & React (can take 5–15 min — progress will sit here, not stuck)…",
      ratio: 0.12,
    };
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
    return {
      detail: "Build done — swapping build and restarting panel (~15–60s brief outage)…",
      ratio: 0.99,
    };
  }
  if (/Swapping .next.staging|Restarting panel on new build/i.test(t)) {
    return { detail: "Swapping production build — panel briefly offline…", ratio: 0.995 };
  }
  return null;
}

const BUILD_PROGRESS_START = 52;
/** End of compile before swap/restart — keep headroom so 88% is not the "failed" lookalike. */
const BUILD_PROGRESS_END = 90;

export function progressDuringBuild(ratio: number): number {
  const r = Math.min(1, Math.max(0, ratio));
  return Math.round(BUILD_PROGRESS_START + (BUILD_PROGRESS_END - BUILD_PROGRESS_START) * r);
}

/** Soft time-based climb while webpack is silent (avoids a frozen bar at ~55–88%). */
export function buildHeartbeatRatio(baseRatio: number, buildStartedAtMs: number): number {
  const elapsedMin = Math.max(0, (Date.now() - buildStartedAtMs) / 60_000);
  // Over ~12 minutes of silence, creep up to +0.4 on the 0–1 sub-progress scale
  const creep = Math.min(0.4, elapsedMin / 12);
  return Math.min(0.88, Math.max(baseRatio, 0.08) + creep);
}

export const BUILD_STEP_PROGRESS_START = BUILD_PROGRESS_START;
export const BUILD_STEP_PROGRESS_END = BUILD_PROGRESS_END;
