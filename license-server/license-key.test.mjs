import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseLicenseKey, activateStatusError } from "./license-key.mjs";

describe("parseLicenseKey", () => {
  it("rejects unsigned or malformed keys", () => {
    assert.equal(parseLicenseKey(""), null);
    assert.equal(parseLicenseKey("not-a-key"), null);
    const payload = Buffer.from(JSON.stringify({ v: 1, lid: "x", exp: 9999999999 })).toString("base64url");
    assert.equal(parseLicenseKey(`NXLF1.${payload}.dGVzdA`), null);
  });
});

describe("activateStatusError", () => {
  it("blocks revoked and suspended licenses", () => {
    assert.deepEqual(activateStatusError({ status: "REVOKED" }), {
      status: "REVOKED",
      error: "License revoked",
    });
    assert.deepEqual(activateStatusError({ status: "SUSPENDED" }), {
      status: "SUSPENDED",
      error: "License suspended",
    });
    assert.equal(activateStatusError({ status: "ACTIVE" }), null);
    assert.equal(activateStatusError(undefined), null);
  });
});
