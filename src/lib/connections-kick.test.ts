import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveSessionKey } from "./connections";

describe("liveSessionKey", () => {
  it("builds a stable line|ip|stream key", () => {
    assert.equal(liveSessionKey("line1", "1.2.3.4", "stream9"), "line1|1.2.3.4|stream9");
  });

  it("tolerates missing ip/stream", () => {
    assert.equal(liveSessionKey("line1"), "line1||");
    assert.equal(liveSessionKey("line1", null, null), "line1||");
  });
});
