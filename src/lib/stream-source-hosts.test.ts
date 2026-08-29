import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_SOURCE_ORIGIN,
  normalizeSourceOriginInput,
  rewriteUrlOrigin,
  streamSourceOrigin,
} from "./stream-source-hosts";

describe("streamSourceOrigin", () => {
  it("groups http default port", () => {
    assert.equal(streamSourceOrigin("http://Prov.Example:80/live/a"), "http://prov.example");
  });
  it("keeps non-default port", () => {
    assert.equal(streamSourceOrigin("http://prov.example:8080/live/a"), "http://prov.example:8080");
  });
  it("marks pending and empty", () => {
    assert.equal(streamSourceOrigin("pending://x"), EMPTY_SOURCE_ORIGIN);
    assert.equal(streamSourceOrigin(""), EMPTY_SOURCE_ORIGIN);
  });
});

describe("rewriteUrlOrigin", () => {
  it("rewrites host and keeps path", () => {
    assert.equal(
      rewriteUrlOrigin("http://old.example:8080/live/u/p/1", "http://old.example:8080", "http://new.example:80"),
      "http://new.example/live/u/p/1"
    );
  });
  it("leaves other hosts alone", () => {
    assert.equal(
      rewriteUrlOrigin("http://keep.example/a", "http://old.example", "http://new.example"),
      "http://keep.example/a"
    );
  });
});

describe("normalizeSourceOriginInput", () => {
  it("accepts host only", () => {
    assert.equal(normalizeSourceOriginInput("dns.provider:25461"), "http://dns.provider:25461");
  });
});
