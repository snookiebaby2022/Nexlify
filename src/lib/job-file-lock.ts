import { open, readFile, rename, unlink, writeFile } from "fs/promises";

export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify(data);
  await writeFile(tmp, payload, "utf8");
  try {
    await rename(tmp, filePath);
  } catch {
    await writeFile(filePath, payload, "utf8");
    try {
      await unlink(tmp);
    } catch {
      /* ignore */
    }
  }
}

export async function acquireExclusiveLock(lockPath: string, contents: string): Promise<boolean> {
  try {
    const fh = await open(lockPath, "wx");
    try {
      await fh.writeFile(contents, "utf8");
    } finally {
      await fh.close();
    }
    return true;
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
    if (code === "EEXIST") return false;
    throw e;
  }
}

export async function releaseLock(lockPath: string): Promise<void> {
  try {
    await unlink(lockPath);
  } catch {
    /* ignore */
  }
}

/** Steal a lock when the caller confirms the previous holder is gone. */
export async function acquireExclusiveLockOrSteal(
  lockPath: string,
  contents: string,
  canSteal: () => Promise<boolean>
): Promise<boolean> {
  if (await acquireExclusiveLock(lockPath, contents)) return true;
  if (!(await canSteal())) return false;
  await releaseLock(lockPath);
  return acquireExclusiveLock(lockPath, contents);
}

export async function readLockContents(lockPath: string): Promise<string | null> {
  try {
    return await readFile(lockPath, "utf8");
  } catch {
    return null;
  }
}
