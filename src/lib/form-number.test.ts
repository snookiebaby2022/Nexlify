import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { coerceLineMaxConnections, coerceMinInt, parseIntAllowEmpty } from "./form-number";

describe("parseIntAllowEmpty", () => {
  it("keeps empty while typing", () => {
    assert.equal(parseIntAllowEmpty(""), "");
    assert.equal(parseIntAllowEmpty("   "), "");
  });

  it("parses a replacement digit", () => {
    assert.equal(parseIntAllowEmpty("2"), 2);
  });
});

describe("coerceMinInt", () => {
  it("falls back to min for empty", () => {
    assert.equal(coerceMinInt("", 1), 1);
  });

  it("keeps a valid value", () => {
    assert.equal(coerceMinInt(2, 1), 2);
  });
});

describe("coerceLineMaxConnections", () => {
  it("treats 0 as unlimited (not a fallback to 1)", () => {
    assert.equal(coerceLineMaxConnections(0), 0);
  });

  it("falls back when empty", () => {
    assert.equal(coerceLineMaxConnections(""), 1);
  });
});
