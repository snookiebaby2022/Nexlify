import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCategoryName, categoryMergeKey } from "./category-options";

test("normalizeCategoryName treats XUI pipe names as the same folder", () => {
  assert.equal(normalizeCategoryName("UK | Entertainment"), "uk entertainment");
  assert.equal(normalizeCategoryName("UK Entertainment"), "uk entertainment");
  assert.equal(normalizeCategoryName("  UK   |  Entertainment "), "uk entertainment");
});

test("categoryMergeKey merges renamed migration duplicates", () => {
  assert.equal(categoryMergeKey("UK | Documentries"), categoryMergeKey("UK Documentry"));
  assert.equal(categoryMergeKey("UK | Kids"), categoryMergeKey("UK Kids"));
  assert.equal(categoryMergeKey("sky sports"), categoryMergeKey("sky sports channels"));
});

test("categoryMergeKey keeps country folders separate", () => {
  assert.notEqual(categoryMergeKey("UK | Entertainment"), categoryMergeKey("USA Entertainment"));
  assert.notEqual(categoryMergeKey("UK | Kids"), categoryMergeKey("Kids channels"));
  assert.notEqual(categoryMergeKey("UK | sky sports"), categoryMergeKey("sky sports"));
});
