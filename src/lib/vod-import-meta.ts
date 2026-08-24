/** Encode VOD agent metadata for bulk imports (Xtream-readable JSON). */

import { encodeVodAgentCmd, parseVodAgentCmd } from "./vod-meta";

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
  const existing = parseVodAgentCmd(existingAgentStartCmd);
  const base: Record<string, unknown> = {
    ...existing,
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
    Object.keys(existing).length > 0;

  if (!hasContent) return existingAgentStartCmd ?? null;
  return encodeVodAgentCmd(base);
}
