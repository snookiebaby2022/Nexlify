/** Live stream options stored in Stream.agentStartCmd as NEXLIFY_LIVE:{json} */

export type ParsedLiveMeta = {
  directSource: boolean;
  redirectStream: boolean;
  isAdult: boolean;
  onDemandProbesize: string;
  transcodeProfile: string;
  /** Legacy: used to rename catalog name. Now-playing is stored separately. */
  autoSyncNameFromEpg: boolean;
  nowPlayingTitle: string | null;
  catalogName: string | null;
  raw: Record<string, unknown> | null;
};

const PREFIX = "NEXLIFY_LIVE:";

export function parseLiveStreamMeta(agentStartCmd: string | null | undefined): ParsedLiveMeta {
  const empty: ParsedLiveMeta = {
    directSource: false,
    redirectStream: false,
    isAdult: false,
    onDemandProbesize: "256000",
    transcodeProfile: "none",
    autoSyncNameFromEpg: false,
    nowPlayingTitle: null,
    catalogName: null,
    raw: null,
  };
  if (!agentStartCmd?.startsWith(PREFIX)) return empty;
  try {
    const raw = JSON.parse(agentStartCmd.slice(PREFIX.length)) as Record<string, unknown>;
    return {
      directSource: raw.directSource === true,
      redirectStream: raw.redirectStream === true,
      isAdult: raw.isAdult === true,
      onDemandProbesize: String(raw.onDemandProbesize ?? "256000"),
      transcodeProfile: String(raw.transcodeProfile ?? "none"),
      autoSyncNameFromEpg: raw.autoSyncNameFromEpg === true,
      nowPlayingTitle: typeof raw.nowPlayingTitle === "string" ? raw.nowPlayingTitle : null,
      catalogName: typeof raw.catalogName === "string" ? raw.catalogName : null,
      raw,
    };
  } catch {
    return empty;
  }
}

export function encodeLiveStreamMeta(meta: Record<string, unknown>): string {
  return `${PREFIX}${JSON.stringify({ v: 1, ...meta })}`;
}
