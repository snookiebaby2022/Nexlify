/** True origin probe fails only — excludes stale Viewer: edge stamps in lastProbeError. */
export function liveOriginProbeFailWhere() {
  return {
    lastProbeOk: false as const,
    NOT: { lastProbeError: { startsWith: "Viewer:" } },
  };
}

/** Origin + splice failures for dashboard Issues / Live Offline (excludes Viewer: stamps). */
export function liveOriginOrSpliceFailWhere() {
  return {
    type: "LIVE" as const,
    isActive: true,
    OR: [liveOriginProbeFailWhere(), { lastSpliceOk: false }],
  };
}

/** Same predicate as liveOriginOrSpliceFailWhere, for client / post-probe list filtering. */
export function isLiveOriginOrSpliceFailed(s: {
  lastProbeOk?: boolean | null;
  lastProbeError?: string | null;
  lastSpliceOk?: boolean | null;
}): boolean {
  const probeFail =
    s.lastProbeOk === false && !String(s.lastProbeError ?? "").startsWith("Viewer:");
  return probeFail || s.lastSpliceOk === false;
}

/** Operator-facing error: prefer probe message, else splice. */
export function liveOriginOrSpliceError(s: {
  lastProbeError?: string | null;
  lastSpliceError?: string | null;
}): string | null {
  const probe = String(s.lastProbeError ?? "").trim();
  if (probe && !probe.startsWith("Viewer:")) return probe;
  const splice = String(s.lastSpliceError ?? "").trim();
  return splice || null;
}
