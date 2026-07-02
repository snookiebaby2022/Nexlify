/** Encode NEXLIFY_VOD agent metadata for bulk VOD imports. */

export type VodImportMetaInput = {
  directSource?: boolean;
  nativeFrames?: boolean;
  isAdult?: boolean;
  outputFormats?: string;
  userAgent?: string;
  proxy?: string;
  headers?: string[];
  transcodeProfile?: string;
  serverIds?: string[];
  bouquetIds?: string[];
  removeSubtitles?: boolean;
  notes?: string;
};

export function encodeImportVodMeta(
  input: VodImportMetaInput,
  existingAgentStartCmd?: string | null
): string | null {
  let base: Record<string, unknown> = {
    v: 1,
    location: "remote",
    doNotEncode: false,
    symlinkSource: false,
    directSource: input.directSource ?? false,
    removeSubtitles: input.removeSubtitles ?? false,
    nativeFrames: input.nativeFrames ?? false,
    isAdult: input.isAdult ?? false,
    outputFormats: input.outputFormats ?? "mp4",
    customMap: "",
    userAgent: input.userAgent ?? "",
    proxy: input.proxy ?? "",
    headers: input.headers?.length ? input.headers : [""],
    serverIds: input.serverIds ?? [],
    transcodeProfile: input.transcodeProfile ?? "none",
    bouquetIds: input.bouquetIds ?? [],
  };

  if (existingAgentStartCmd?.startsWith("NEXLIFY_VOD:")) {
    try {
      const parsed = JSON.parse(existingAgentStartCmd.slice("NEXLIFY_VOD:".length)) as Record<
        string,
        unknown
      >;
      base = { ...parsed, ...base };
    } catch {
      /* use defaults */
    }
  }

  const hasContent =
    input.directSource ||
    input.nativeFrames ||
    input.isAdult ||
    input.userAgent ||
    input.proxy ||
    (input.headers?.some((h) => h.trim()) ?? false) ||
    (input.serverIds?.length ?? 0) > 0 ||
    (input.bouquetIds?.length ?? 0) > 0 ||
    input.transcodeProfile !== "none" ||
    existingAgentStartCmd?.startsWith("NEXLIFY_VOD:");

  if (!hasContent) return existingAgentStartCmd ?? null;
  return `NEXLIFY_VOD:${JSON.stringify(base)}`;
}
