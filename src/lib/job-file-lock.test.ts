import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { acquireExclusiveLock, releaseLock, writeJsonAtomic } from "./job-file-lock";

test("acquireExclusiveLock is exclusive (wx)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nexlify-lock-"));
  const lock = path.join(dir, "job.lock");
  try {
    assert.equal(await acquireExclusiveLock(lock, "a"), true);
    assert.equal(await acquireExclusiveLock(lock, "b"), false);
    await releaseLock(lock);
    assert.equal(await acquireExclusiveLock(lock, "c"), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("writeJsonAtomic writes complete JSON", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nexlify-json-"));
  const file = path.join(dir, "job.json");
  try {
    await writeJsonAtomic(file, { status: "running", n: 1 });
    const parsed = JSON.parse(await readFile(file, "utf8")) as { status: string; n: number };
    assert.equal(parsed.status, "running");
    assert.equal(parsed.n, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
