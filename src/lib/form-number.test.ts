import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { coerceMinInt, parseIntAllowEmpty } from "./form-number";

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
