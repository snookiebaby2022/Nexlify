import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkLineDeviceLock } from "./line-device-lock";

describe("checkLineDeviceLock", () => {
  it("allows when no device lock is set", () => {
    assert.equal(checkLineDeviceLock({ lockMac: "", lockDeviceId: "" }, { mac: "", deviceId: "" }), true);
  });

  it("denies when a lock is set and identity does not match", () => {
    assert.equal(
      checkLineDeviceLock({ lockMac: "aa:bb:cc:dd:ee:ff", lockDeviceId: "" }, { mac: "001122334455", deviceId: "" }),
      false
    );
  });

  it("allows a matching MAC regardless of separators", () => {
    assert.equal(
      checkLineDeviceLock(
        { lockMac: "AA:BB:CC:DD:EE:FF", lockDeviceId: "" },
        { mac: "aabbccddeeff", deviceId: "" }
      ),
      true
    );
  });
});
