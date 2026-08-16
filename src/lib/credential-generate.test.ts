import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MIN_LINE_CREDENTIAL_LENGTH,
  validateLineCredential,
  validateLinePasswordPolicy,
  validatePanelAccountCredentials,
  generateLinePassword,
  generateLineUsername,
} from "./credential-generate";

describe("credential charset + min length", () => {
  it("requires at least 6 characters", () => {
    assert.equal(MIN_LINE_CREDENTIAL_LENGTH, 6);
    assert.match(validateLineCredential("abc12", "username") ?? "", /at least 6/);
    assert.match(validateLineCredential("Ab1!", "password") ?? "", /at least 6/);
  });

  it("allows letters and numbers in username and password", () => {
    assert.equal(validateLineCredential("user01", "username"), null);
    assert.equal(validateLineCredential("Pass99", "password"), null);
    assert.equal(validatePanelAccountCredentials("reseller1", "Secret9"), null);
  });

  it("rejects spaces and path-breaking characters", () => {
    assert.match(validateLineCredential("user name", "username") ?? "", /spaces/);
    assert.match(validateLineCredential("bad/user", "username") ?? "", /cannot contain/);
  });

  it("no longer requires letters-only passwords", () => {
    assert.equal(
      validateLinePasswordPolicy("Abc123xyz", "someone", {
        requireLetterAndDigit: false,
        blockCommonPasswords: false,
      }),
      null
    );
  });

  it("generators include digits over enough samples", () => {
    let sawDigit = false;
    for (let i = 0; i < 40; i++) {
      const u = generateLineUsername();
      const p = generateLinePassword();
      assert.ok(u.length >= 6);
      assert.ok(p.length >= 6);
      if (/\d/.test(u) || /\d/.test(p)) sawDigit = true;
    }
    assert.equal(sawDigit, true);
  });
});
