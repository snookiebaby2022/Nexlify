import assert from "node:assert/strict";
import test from "node:test";
import { zipSingleBuffer, writeBackupArchive } from "./backup-archive";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("zipSingleBuffer writes a PKZIP file", () => {
  const zip = zipSingleBuffer("hello.json", Buffer.from('{"ok":true}'));
  assert.equal(zip[0], 0x50);
  assert.equal(zip[1], 0x4b);
  assert.equal(zip[2], 0x03);
  assert.equal(zip[3], 0x04);
});

test("writeBackupArchive zip does not fall back to gzip", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nx-bak-"));
  try {
    const written = await writeBackupArchive(dir, "nexlify-backup-test", '{"a":1}', "zip");
    assert.equal(written.format, "zip");
    assert.ok(written.filePath.endsWith(".zip"));
    const buf = await readFile(written.filePath);
    assert.equal(buf[0], 0x50);
    assert.equal(buf[1], 0x4b);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
