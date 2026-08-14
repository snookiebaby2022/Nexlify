import { test } from "node:test";
import assert from "node:assert/strict";
import { secretsEqual, canRepairAdminHash } from "./secrets-equal";

test("secretsEqual rejects empty and mismatched lengths", () => {
  assert.equal(secretsEqual("", "abc"), false);
  assert.equal(secretsEqual("abc", ""), false);
  assert.equal(secretsEqual(null, "abc"), false);
  assert.equal(secretsEqual("ab", "abc"), false);
  assert.equal(secretsEqual("abc", "abc"), true);
  assert.equal(secretsEqual("abc", "abd"), false);
});

test("canRepairAdminHash only when hash is missing or not bcrypt", () => {
  assert.equal(canRepairAdminHash({ isAdminTarget: false, user: null }), false);
  assert.equal(canRepairAdminHash({ isAdminTarget: true, user: null }), true);
  assert.equal(
    canRepairAdminHash({
      isAdminTarget: true,
      user: { passwordHash: "$2b$12$abcdefghijklmnopqrstuv", isActive: true },
    }),
    false
  );
  assert.equal(
    canRepairAdminHash({
      isAdminTarget: true,
      user: { passwordHash: "$2b$12$abcdefghijklmnopqrstuv", isActive: false },
    }),
    false
  );
  assert.equal(
    canRepairAdminHash({
      isAdminTarget: true,
      user: { passwordHash: "plaintext", isActive: true },
    }),
    true
  );
});
