import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkLineIpAccess } from "./line-ip-lock";

describe("checkLineIpAccess", () => {
  it("allows when lock is off or the allow-list is empty", () => {
    assert.equal(checkLineIpAccess({ lockToIp: false, allowedIps: "1.2.3.4" }, "9.9.9.9"), true);
    assert.equal(checkLineIpAccess({ lockToIp: true, allowedIps: "" }, "9.9.9.9"), true);
  });

  it("denies a locked line from a foreign IP", () => {
    assert.equal(checkLineIpAccess({ lockToIp: true, allowedIps: "1.2.3.4" }, "9.9.9.9"), false);
    assert.equal(checkLineIpAccess({ lockToIp: true, allowedIps: "10.0.0.0/8" }, "1.2.3.4"), false);
  });

  it("allows a locked line from an exact or CIDR match", () => {
    assert.equal(checkLineIpAccess({ lockToIp: true, allowedIps: "1.2.3.4" }, "1.2.3.4"), true);
    assert.equal(checkLineIpAccess({ lockToIp: true, allowedIps: "10.0.0.0/8" }, "10.9.1.2"), true);
  });
});
