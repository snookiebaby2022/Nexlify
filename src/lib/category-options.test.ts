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
  assert.equal(categoryMergeKey("Kids channels"), categoryMergeKey("UK | Kids"));
  assert.equal(categoryMergeKey("sky sports"), categoryMergeKey("UK | sky sports"));
});
