import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPlayableUpstreamContentType } from "./live-upstream-proxy";
import { getPrimaryBitrate, type BitrateVariant } from "./stream-variants";

describe("isPlayableUpstreamContentType", () => {
  it("accepts mpegts and video types", () => {
    assert.equal(isPlayableUpstreamContentType("video/mp2t"), true);
    assert.equal(isPlayableUpstreamContentType("application/octet-stream"), true);
    assert.equal(isPlayableUpstreamContentType(null), true);
  });
  it("rejects html and json error pages", () => {
    assert.equal(isPlayableUpstreamContentType("text/html; charset=UTF-8"), false);
    assert.equal(isPlayableUpstreamContentType("application/json"), false);
  });
});

describe("getPrimaryBitrate", () => {
  it("does not fall back to variants[0] without isPrimary", () => {
    const variants: BitrateVariant[] = [
      { id: "a", label: "low", path: "http://example/low" },
      { id: "b", label: "hi", path: "http://example/hi", isPrimary: true },
    ];
    assert.equal(getPrimaryBitrate(variants)?.id, "b");
    assert.equal(getPrimaryBitrate([{ id: "a", label: "low", path: "/x" }]), null);
  });
});
