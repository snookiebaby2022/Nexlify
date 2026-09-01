import type { VodMode } from "@prisma/client";

export function vodModeLabel(mode: VodMode | string): string {
  switch (mode) {
    case "ON_DEMAND":
      return "On demand";
    case "CATCHUP":
      return "Catch-up";
    default:
      return "Live";
  }
}

function parseVodModeToken(raw: string): VodMode | null {
  const token = raw.trim().toUpperCase();
  if (token === "ON_DEMAND" || token === "CATCHUP" || token === "LIVE") return token as VodMode;
  if (token === "MOVIE" || token === "SERIES" || token === "VOD") return "ON_DEMAND";
  return null;
}

/** Resolve display/storage mode when legacy isOnDemand and vodMode disagree. vodMode wins when set. */
export function effectiveStreamVodMode(stream: {
  vodMode?: VodMode | string | null;
  isOnDemand?: boolean | null;
}): VodMode {
  const parsed = parseVodModeToken(String(stream.vodMode ?? ""));
  if (parsed) return parsed;
  return stream.isOnDemand ? "ON_DEMAND" : "LIVE";
}

export function syncVodModeFields(input: {
  isOnDemand?: boolean;
  vodMode?: VodMode | string;
}): { isOnDemand: boolean; vodMode: VodMode } {
  const explicitVodMode =
    input.vodMode !== undefined && String(input.vodMode).trim() !== ""
      ? parseVodModeToken(String(input.vodMode))
      : null;

  if (explicitVodMode) {
    const isOnDemand = explicitVodMode !== "LIVE";
    return { isOnDemand, vodMode: explicitVodMode };
  }

  if (input.isOnDemand === true) {
    return { isOnDemand: true, vodMode: "ON_DEMAND" };
  }
  if (input.isOnDemand === false) {
    return { isOnDemand: false, vodMode: "LIVE" };
  }

  return { isOnDemand: false, vodMode: "LIVE" };
}
