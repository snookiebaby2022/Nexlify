import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCategoryName } from "./category-options";

test("normalizeCategoryName treats XUI pipe names as the same folder", () => {
  assert.equal(normalizeCategoryName("UK | Entertainment"), "uk entertainment");
  assert.equal(normalizeCategoryName("UK Entertainment"), "uk entertainment");
  assert.equal(normalizeCategoryName("  UK   |  Entertainment "), "uk entertainment");
});
