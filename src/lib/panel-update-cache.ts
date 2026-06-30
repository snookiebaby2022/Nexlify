import { createHash } from "crypto";
import { readFile, writeFile } from "fs/promises";
import path from "path";

type UpdateCache = {
  lockHash: string | null;
  schemaHash: string | null;
};

function cachePath(repoPath: string): string {
  return path.join(repoPath, ".panel-update-cache.json");
}

async function hashFile(filePath: string): Promise<string | null> {
  try {
    const data = await readFile(filePath);
    return createHash("sha256").update(data).digest("hex");
  } catch {
    return null;
  }
}

async function readCache(repoPath: string): Promise<UpdateCache> {
  try {
    const raw = await readFile(cachePath(repoPath), "utf8");
    const parsed = JSON.parse(raw) as UpdateCache;
    return {
      lockHash: parsed.lockHash ?? null,
      schemaHash: parsed.schemaHash ?? null,
    };
  } catch {
    return { lockHash: null, schemaHash: null };
  }
}

export async function writeUpdateCache(repoPath: string): Promise<void> {
  const lockHash = await hashFile(path.join(repoPath, "package-lock.json"));
  const schemaHash = await hashFile(path.join(repoPath, "prisma/schema.prisma"));
  await writeFile(
    cachePath(repoPath),
    JSON.stringify({ lockHash, schemaHash }, null, 2),
    "utf8"
  );
}

export async function lockfileChanged(repoPath: string): Promise<boolean> {
  const current = await hashFile(path.join(repoPath, "package-lock.json"));
  if (!current) return true;
  const cache = await readCache(repoPath);
  return cache.lockHash !== current;
}

export async function schemaChanged(repoPath: string): Promise<boolean> {
  const current = await hashFile(path.join(repoPath, "prisma/schema.prisma"));
  if (!current) return false;
  const cache = await readCache(repoPath);
  return cache.schemaHash !== current;
}
