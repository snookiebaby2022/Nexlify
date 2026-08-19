import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { confinePathToDir, resolveBackupDir } from "./backup-path";

test("confinePathToDir rejects traversal and absolute escapes", () => {
  const dir = path.resolve("/opt/nexlify-panel/backups");
  assert.equal(confinePathToDir("nexlify-backup-1.json", dir), path.join(dir, "nexlify-backup-1.json"));
  assert.equal(confinePathToDir("../.env", dir), null);
  assert.equal(confinePathToDir("/etc/passwd", dir), null);
});

test("resolveBackupDir defaults to ./backups", () => {
  const dir = resolveBackupDir("");
  assert.ok(dir.endsWith("backups") || dir.endsWith("backups\\") || dir.includes("backups"));
});
