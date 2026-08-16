import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isOwnedPlaybackUrl, rewriteUrlThroughCdn } from "./smart-cdn";

describe("rewriteUrlThroughCdn", () => {
  it("rewrites host onto CDN base while keeping path and query", () => {
    const out = rewriteUrlThroughCdn(
      "http://origin.example/live/ch1.ts?token=abc",
      "https://cdn.example"
    );
    assert.equal(out, "https://cdn.example/live/ch1.ts?token=abc");
  });

  it("preserves CDN base path prefix", () => {
    const out = rewriteUrlThroughCdn(
      "http://origin.example/live/ch1.ts",
      "https://cdn.example/edge"
    );
    assert.equal(out, "https://cdn.example/edge/live/ch1.ts");
  });

  it("returns original URL when CDN base is invalid", () => {
    const src = "http://origin.example/live/ch1.ts";
    assert.equal(rewriteUrlThroughCdn(src, "not-a-url"), src);
  });
});

describe("isOwnedPlaybackUrl", () => {
  it("allows panel-owned hosts only", () => {
    const owned = new Set(["panel.example.com", "edge.example.com"]);
    assert.equal(isOwnedPlaybackUrl("https://panel.example.com/live/1.ts", owned), true);
    assert.equal(isOwnedPlaybackUrl("https://cdn.edge.example.com/x", owned), true);
    assert.equal(isOwnedPlaybackUrl("http://95.217.58.49:42400/file.mkv", owned), false);
    assert.equal(isOwnedPlaybackUrl("https://provider.cdn.net/live/1", owned), false);
  });
});
