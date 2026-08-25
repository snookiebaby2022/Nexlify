import path from "path";
import { resolvePanelRepoPathSync } from "@/lib/panel-repo-path";

export function resolveBackupDir(rawPath?: string | null): string {
  const raw = String(rawPath ?? "").trim();
  if (raw && !raw.startsWith("(") && path.isAbsolute(raw)) return path.resolve(raw);
  const root = resolvePanelRepoPathSync();
  return path.resolve(root, raw && !raw.startsWith("(") ? raw.replace(/^\.\//, "") : "backups");
}

/** Resolve filePath under dir. Rejects traversal and absolute paths outside dir. */
export function confinePathToDir(filePath: string, dir: string): string | null {
  if (!filePath || typeof filePath !== "string") return null;
  const root = path.resolve(dir);
  const resolved = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(root, filePath);
  const rel = path.relative(root, resolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolved;
}
