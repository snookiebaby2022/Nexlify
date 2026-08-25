import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeChecksum, encryptBackup, decryptBackup } from "./backup-run";
import { cronMatchesThisHour } from "./backup-schedule";

describe("backup helpers", () => {
  it("checksum is stable", () => {
    assert.equal(computeChecksum('{"a":1}'), computeChecksum('{"a":1}'));
    assert.notEqual(computeChecksum('{"a":1}'), computeChecksum('{"a":2}'));
  });

  it("encrypt/decrypt roundtrip", () => {
    const enc = encryptBackup('{"ok":true}', "secret");
    assert.equal(decryptBackup(enc, "secret"), '{"ok":true}');
  });

  it("pg dump hour matching still works", () => {
    const d = new Date(2026, 7, 15, 4, 37, 0);
    assert.equal(cronMatchesThisHour("0 4 * * *", d), true);
    assert.equal(cronMatchesThisHour("0 5 * * *", d), false);
  });
});
