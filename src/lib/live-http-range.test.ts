import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTinyLiveRangeProbe } from "./live-http-range";

describe("isTinyLiveRangeProbe", () => {
  it("does not treat LibVLC open-ended Range as a probe", () => {
    assert.equal(isTinyLiveRangeProbe("bytes=0-"), false);
    assert.equal(isTinyLiveRangeProbe("bytes=0- "), false);
    assert.equal(isTinyLiveRangeProbe(""), false);
    assert.equal(isTinyLiveRangeProbe(null), false);
  });

  it("treats small finite ranges as Update Content probes", () => {
    assert.equal(isTinyLiveRangeProbe("bytes=0-0"), true);
    assert.equal(isTinyLiveRangeProbe("bytes=0-1"), true);
    assert.equal(isTinyLiveRangeProbe("bytes=0-1023"), true);
  });
});
