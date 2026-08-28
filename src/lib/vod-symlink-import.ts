import fs from "node:fs";
import path from "node:path";

export type SymlinkMode = "symlink" | "hardlink" | "copy";

/** Link or copy a VOD file into the library path (XUI-style space-efficient imports). */
export function importVodFileWithLink(
  sourcePath: string,
  destPath: string,
  mode: SymlinkMode
): { ok: boolean; mode: SymlinkMode; error?: string } {
  const src = path.resolve(sourcePath);
  const dest = path.resolve(destPath);
  if (!fs.existsSync(src)) {
    return { ok: false, mode, error: "source missing" };
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) {
    return { ok: true, mode: "copy" };
  }
  try {
    if (mode === "symlink") {
      fs.symlinkSync(src, dest);
      return { ok: true, mode: "symlink" };
    }
    if (mode === "hardlink") {
      fs.linkSync(src, dest);
      return { ok: true, mode: "hardlink" };
    }
    fs.copyFileSync(src, dest);
    return { ok: true, mode: "copy" };
  } catch (e) {
    try {
      fs.copyFileSync(src, dest);
      return { ok: true, mode: "copy" };
    } catch (e2) {
      return {
        ok: false,
        mode,
        error: e2 instanceof Error ? e2.message : String(e2),
      };
    }
  }
}

export function vodImportLinkMode(useSymlinks: boolean): SymlinkMode {
  return useSymlinks ? "symlink" : "copy";
}
