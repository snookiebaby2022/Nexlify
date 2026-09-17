import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pulseBatchDedupeKey, type PulseBatchEntry } from "./connection-pulse-batch";

describe("connection-pulse-batch helpers", () => {
  it("builds stable dedupe keys for the same viewer triple", () => {
    const a: PulseBatchEntry = { lineId: "line1", streamId: "stream1", ip: "1.2.3.4", bytes: 10 };
    const b: PulseBatchEntry = { lineId: "line1", streamId: "stream1", ip: "::ffff:1.2.3.4", bytes: 20 };
    assert.equal(pulseBatchDedupeKey(a), pulseBatchDedupeKey(b));
  });
});
