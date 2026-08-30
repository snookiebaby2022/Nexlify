import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createGzip, type Gzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

export const CATALOG_BLOB_VERSION = "v12";
export const CATALOG_TTL_MS = 2 * 60 * 1000;
export const CATALOG_STALE_MS = 20 * 60 * 1000;
/** Dead builders must not pin XCIPTV Update Content for minutes. */
const LOCK_STALE_MS = 45_000;
const LOCK_WAIT_MS = 150;
/** Wait for an in-flight builder instead of stealing after 2s (duplicate VOD SQL). */
const LOCK_MISSING_BLOB_WAIT_MS = 120_000;

export function catalogCacheDir(): string {
  const env = process.env.NEXLIFY_CATALOG_CACHE_DIR?.trim();
  if (env) return env;
  if (process.platform === "win32") return path.join(os.tmpdir(), "nexlify-catalog-cache");
  return "/var/lib/nexlify/catalog-cache";
}

export function ensureCatalogCacheDir(): string {
  const dir = catalogCacheDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function hashCatalogKey(parts: string[]): string {
  return createHash("sha1").update(parts.join("\0")).digest("hex");
}

export function lineBouquetCacheToken(bouquetIds: string[]): string {
  return [...bouquetIds].sort().join(",");
}

export function catalogBlobPath(name: string): string {
  return path.join(ensureCatalogCacheDir(), name);
}

export async function catalogFileAgeMs(filePath: string): Promise<number | null> {
  try {
    const st = await fs.stat(filePath);
    if (!st.isFile() || st.size < 8) return null;
    return Date.now() - st.mtimeMs;
  } catch {
    return null;
  }
}

export function catalogFileIsFresh(ageMs: number | null, ttlMs = CATALOG_TTL_MS): boolean {
  return ageMs != null && ageMs >= 0 && ageMs < ttlMs;
}

export function catalogFileIsUsable(ageMs: number | null, _staleMs = CATALOG_STALE_MS): boolean {
  // Serve any complete blob immediately. XCIPTV Update Content times out if the
  // request waits on a full SQL rebuild after CATALOG_STALE_MS (first open fails,
  // second succeeds once the file exists). Freshness still drives background rebuild.
  return ageMs != null && ageMs >= 0;
}

function writeGzipChunk(gzip: Gzip, chunk: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onErr = (err: Error) => reject(err);
    gzip.once("error", onErr);
    if (gzip.write(chunk)) {
      gzip.off("error", onErr);
      resolve();
      return;
    }
    gzip.once("drain", () => {
      gzip.off("error", onErr);
      resolve();
    });
  });
}

/** Stream a JSON array to a gzip file without holding the catalog in RAM. */
export async function writeGzipJsonArrayFile(
  destPath: string,
  iterate: (writeItem: (obj: unknown) => Promise<void>) => Promise<void>
): Promise<void> {
  ensureCatalogCacheDir();
  const tmp = `${destPath}.${process.pid}.${Date.now()}.tmp`;
  const gzip = createGzip({ level: 1 });
  const out = createWriteStream(tmp);
  const done = pipeline(gzip, out);
  let first = true;
  try {
    await writeGzipChunk(gzip, "[");
    await iterate(async (obj) => {
      const json = JSON.stringify(obj);
      if (!first) await writeGzipChunk(gzip, ",");
      first = false;
      await writeGzipChunk(gzip, json);
    });
    await writeGzipChunk(gzip, "]");
    gzip.end();
    await done;
    await replaceCatalogFile(tmp, destPath);
  } catch (err) {
    gzip.destroy();
    out.destroy();
    await fs.unlink(tmp).catch(() => undefined);
    throw err;
  }
}

/** Stream UTF-8 text through gzip to disk (XMLTV). */
export async function writeGzipTextFile(
  destPath: string,
  iterate: (write: (chunk: string) => Promise<void>) => Promise<void>
): Promise<void> {
  ensureCatalogCacheDir();
  const tmp = `${destPath}.${process.pid}.${Date.now()}.tmp`;
  const gzip = createGzip({ level: 1 });
  const out = createWriteStream(tmp);
  const done = pipeline(gzip, out);
  try {
    await iterate((chunk) => writeGzipChunk(gzip, chunk));
    gzip.end();
    await done;
    await replaceCatalogFile(tmp, destPath);
  } catch (err) {
    gzip.destroy();
    out.destroy();
    await fs.unlink(tmp).catch(() => undefined);
    throw err;
  }
}

async function replaceCatalogFile(tmp: string, destPath: string): Promise<void> {
  try {
    await fs.rename(tmp, destPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
    await fs.copyFile(tmp, destPath);
    await fs.unlink(tmp).catch(() => undefined);
  }
}

function lockPidIsAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stealCatalogLockIfIdle(lockPath: string): Promise<boolean> {
  try {
    const raw = (await fs.readFile(lockPath, "utf8")).trim();
    const pid = Number(raw);
    if (!lockPidIsAlive(pid)) {
      await fs.unlink(lockPath).catch(() => undefined);
      return true;
    }
    const st = await fs.stat(lockPath);
    if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
      await fs.unlink(lockPath).catch(() => undefined);
      return true;
    }
  } catch {
    return true;
  }
  return false;
}

export async function withCatalogBuildLock<T>(
  destPath: string,
  build: () => Promise<T>
): Promise<T | "existing"> {
  const lockPath = `${destPath}.lock`;
  const started = Date.now();
  for (;;) {
    try {
      await fs.writeFile(lockPath, String(process.pid), { flag: "wx" });
      break;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw err;
      const age = await catalogFileAgeMs(destPath);
      if (catalogFileIsUsable(age)) return "existing";
      const stole = await stealCatalogLockIfIdle(lockPath);
      if (stole) continue;
      if (Date.now() - started >= LOCK_MISSING_BLOB_WAIT_MS) {
        const stillAlive = await stealCatalogLockIfIdle(lockPath);
        if (!stillAlive) {
          await fs.unlink(lockPath).catch(() => undefined);
        }
        continue;
      }
      await new Promise((r) => setTimeout(r, LOCK_WAIT_MS));
    }
  }
  const existing = await catalogFileAgeMs(destPath);
  if (catalogFileIsUsable(existing)) {
    await fs.unlink(lockPath).catch(() => undefined);
    return "existing";
  }
  try {
    return await build();
  } finally {
    await fs.unlink(lockPath).catch(() => undefined);
  }
}

export async function purgeCatalogDiskCache(filter?: (name: string) => boolean): Promise<number> {
  const dir = catalogCacheDir();
  let deleted = 0;
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return 0;
  }
  await Promise.all(
    entries.map(async (name) => {
      if (name.endsWith(".tmp")) return;
      if (!name.endsWith(".json.gz") && !name.endsWith(".xml.gz") && !name.endsWith(".lock")) {
        return;
      }
      if (filter && !filter(name)) return;
      try {
        await fs.unlink(path.join(dir, name));
        deleted += 1;
      } catch {
        /* ignore */
      }
    })
  );
  return deleted;
}
