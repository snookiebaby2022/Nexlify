import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTinyLiveRangeProbe, userAgentIsSmartTv } from "./live-http-range";

const WEBOS_UA =
  "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager";

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

  it("does not treat webOS Range sniff as an empty probe", () => {
    assert.equal(userAgentIsSmartTv(WEBOS_UA), true);
    assert.equal(isTinyLiveRangeProbe("bytes=0-1", WEBOS_UA), false);
    assert.equal(isTinyLiveRangeProbe("bytes=0-1023", WEBOS_UA), false);
  });
});
