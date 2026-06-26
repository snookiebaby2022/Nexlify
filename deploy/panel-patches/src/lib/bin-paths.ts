import { getSettingGroup } from "@/lib/panel-settings";
import { resolveActivePath } from "@/lib/bin-version-catalog";
import type { BinVersionOption } from "@/lib/bin-version-types";
import { NEXLIFY_BIN_LAYOUT, type BinPathKey } from "@/lib/bin-paths-layout";

export {
  BIN_PATH_LABELS,
  pathsFromBinRoot,
  NEXLIFY_BIN_LAYOUT,
  NEXLIFY_BIN_ROOT,
  XUI_BIN_LAYOUT,
  type BinPathKey,
} from "@/lib/bin-paths-layout";

export async function getBinPaths(): Promise<Record<BinPathKey, string>> {
  const stored = await getSettingGroup("binaries");
  const out: Record<BinPathKey, string> = { ...NEXLIFY_BIN_LAYOUT };
  for (const k of Object.keys(NEXLIFY_BIN_LAYOUT) as BinPathKey[]) {
    if (typeof stored[k] === "string" && stored[k]) {
      out[k] = stored[k] as string;
    }
  }
  const ffmpegVersions = stored.ffmpegVersions as BinVersionOption[] | undefined;
  out.ffmpegPath = resolveActivePath(
    ffmpegVersions,
    String(stored.activeFfmpegId ?? ""),
    out.ffmpegPath
  );
  const phpVersions = stored.phpVersions as BinVersionOption[] | undefined;
  out.phpPath = resolveActivePath(
    phpVersions,
    String(stored.activePhpId ?? ""),
    out.phpPath
  );
  return out;
}
