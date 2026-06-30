/** Live stream options stored in Stream.agentStartCmd as NEXLIFY_LIVE:{json} */

export type ParsedLiveMeta = {
  directSource: boolean;
  redirectStream: boolean;
  isAdult: boolean;
  onDemandProbesize: string;
  transcodeProfile: string;
  raw: Record<string, unknown> | null;
};

const PREFIX = "NEXLIFY_LIVE:";

export function parseLiveStreamMeta(agentStartCmd: string | null | undefined): ParsedLiveMeta {
  const empty: ParsedLiveMeta = {
    directSource: false,
    redirectStream: false,
    isAdult: false,
    onDemandProbesize: "512000",
    transcodeProfile: "none",
    raw: null,
  };
  if (!agentStartCmd?.startsWith(PREFIX)) return empty;
  try {
    const raw = JSON.parse(agentStartCmd.slice(PREFIX.length)) as Record<string, unknown>;
    return {
      directSource: raw.directSource === true,
      redirectStream: raw.redirectStream === true,
      isAdult: raw.isAdult === true,
      onDemandProbesize: String(raw.onDemandProbesize ?? "512000"),
      transcodeProfile: String(raw.transcodeProfile ?? "none"),
      raw,
    };
  } catch {
    return empty;
  }
}

export function encodeLiveStreamMeta(meta: Record<string, unknown>): string {
  return `${PREFIX}${JSON.stringify({ v: 1, ...meta })}`;
}
