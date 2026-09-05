import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLiveUrlShareCounts,
  noteLiveUrlShareChange,
  shouldPreserveCoalescedLiveUrl,
} from "./live-coalesce-protect";

describe("live-coalesce-protect", () => {
  it("preserves shared upstreams and allows unique retargets", () => {
    const shares = buildLiveUrlShareCounts([
      { streamUrl: "http://junki3monk3y.com/a/b/753" },
      { streamUrl: "http://junki3monk3y.com/a/b/753" },
      { streamUrl: "http://junki3monk3y.com/a/b/999" },
    ]);
    assert.equal(
      shouldPreserveCoalescedLiveUrl(
        "http://junki3monk3y.com/a/b/753",
        "http://junki3monk3y.com/a/b/754",
        shares
      ),
      true
    );
    assert.equal(
      shouldPreserveCoalescedLiveUrl(
        "http://junki3monk3y.com/a/b/999",
        "http://junki3monk3y.com/a/b/1000",
        shares
      ),
      false
    );
    assert.equal(
      shouldPreserveCoalescedLiveUrl(
        "http://junki3monk3y.com/a/b/753",
        "http://junki3monk3y.com/a/b/753?x=1",
        shares
      ),
      false
    );
  });

  it("updates share counts after an allowed retarget", () => {
    const shares = buildLiveUrlShareCounts([
      { streamUrl: "http://ex/a/1" },
      { streamUrl: "http://ex/a/1" },
    ]);
    noteLiveUrlShareChange(shares, "http://ex/a/1", "http://ex/a/2");
    assert.equal(shares.get("http://ex/a/1"), 1);
    assert.equal(shares.get("http://ex/a/2"), 1);
    assert.equal(
      shouldPreserveCoalescedLiveUrl("http://ex/a/1", "http://ex/a/9", shares),
      false
    );
  });
});
