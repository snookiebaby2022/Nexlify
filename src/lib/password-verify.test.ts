import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnSync } from "child_process";
import { isPrehashedPassword, verifyStoredPassword } from "./password-verify";
import bcrypt from "bcryptjs";

describe("password-verify", () => {
  it("detects bcrypt and sha512-crypt as prehashed", () => {
    assert.equal(isPrehashedPassword("$2b$10$abcdefghijklmnopqrstuu"), true);
    assert.equal(
      isPrehashedPassword(
        "$6$rounds=20000$xui$YybWU8CrGsAj4F6IBuFQni79Vk.v2zryHDQ1Eslh.HspvHDLyYOegPjV5hOCj5KVtrnSj3tMIf.mhcNR6u9gi0"
      ),
      true
    );
    assert.equal(isPrehashedPassword("plaintext-password"), false);
  });

  it("verifies bcrypt hashes", async () => {
    const hash = await bcrypt.hash("Secret123!", 4);
    assert.equal(await verifyStoredPassword("Secret123!", hash), true);
    assert.equal(await verifyStoredPassword("wrong", hash), false);
  });

  it("verifies sha512-crypt via python3 when available", async () => {
    const gen = spawnSync(
      "python3",
      ["-c", "import crypt; print(crypt.crypt('XuiPass!', crypt.METHOD_SHA512))"],
      { encoding: "utf8" }
    );
    if (gen.status !== 0 || !gen.stdout.trim().startsWith("$6$")) {
      // Skip on hosts without python crypt
      return;
    }
    const hash = gen.stdout.trim();
    assert.equal(await verifyStoredPassword("XuiPass!", hash), true);
    assert.equal(await verifyStoredPassword("nope", hash), false);
  });
});
