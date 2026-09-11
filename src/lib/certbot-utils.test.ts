import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseOpenSslEndDateLine, pickCertbotEmail } from "./certbot-utils";

describe("pickCertbotEmail", () => {
  it("returns first valid email", () => {
    assert.equal(pickCertbotEmail("", "bad", "ops@example.com", "other@test.com"), "ops@example.com");
  });

  it("returns empty when none valid", () => {
    assert.equal(pickCertbotEmail(undefined, "not-an-email"), "");
  });
});

describe("parseOpenSslEndDateLine", () => {
  it("parses openssl notAfter line", () => {
    const r = parseOpenSslEndDateLine("notAfter=Dec 31 23:59:59 2026 GMT");
    assert.ok(r.expiresAt);
    assert.equal(typeof r.daysLeft, "number");
  });
});
