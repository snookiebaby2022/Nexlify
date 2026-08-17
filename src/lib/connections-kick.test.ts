import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  liveSessionKey,
  CAPACITY_STALE_MS,
  TRACK_HEARTBEAT_MS,
} from "./connections";

describe("liveSessionKey", () => {
  it("builds a stable line|ip|stream key", () => {
    assert.equal(liveSessionKey("line1", "1.2.3.4", "stream9"), "line1|1.2.3.4|stream9");
  });

  it("tolerates missing ip/stream", () => {
    assert.equal(liveSessionKey("line1"), "line1||");
    assert.equal(liveSessionKey("line1", null, null), "line1||");
  });
});

describe("connection heartbeat tuning", () => {
  it("uses a 25s DB heartbeat and 2m capacity window", () => {
    assert.equal(TRACK_HEARTBEAT_MS, 25_000);
    assert.equal(CAPACITY_STALE_MS, 2 * 60 * 1000);
  });
});
