import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rewriteUrlThroughCdn } from "./smart-cdn";

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
