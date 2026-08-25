import assert from "node:assert/strict";
import test from "node:test";
import { categoryMergeKey } from "./category-options";
import { isXtreamAllCategoryParam, numericCategoryId } from "./xtream-category-canonical";

test("merge key treats UK | Entertainment and UK Entertainment as same folder", () => {
  assert.equal(categoryMergeKey("UK | Entertainment"), categoryMergeKey("UK Entertainment"));
});

test("different cuids get different numeric ids unless same id", () => {
  const a = numericCategoryId("clxxxxxxxxxxxxxxxxxxxxxxxxx1");
  const b = numericCategoryId("clxxxxxxxxxxxxxxxxxxxxxxxxx2");
  assert.notEqual(a, b);
});

test("null category is 0", () => {
  assert.equal(numericCategoryId(null), "0");
  assert.equal(numericCategoryId(undefined), "0");
});

test("Smarters All category_id is unfiltered", () => {
  assert.equal(isXtreamAllCategoryParam(null), true);
  assert.equal(isXtreamAllCategoryParam(""), true);
  assert.equal(isXtreamAllCategoryParam("*"), true);
  assert.equal(isXtreamAllCategoryParam("ALL"), true);
  assert.equal(isXtreamAllCategoryParam("-1"), true);
  assert.equal(isXtreamAllCategoryParam("0"), false);
  assert.equal(isXtreamAllCategoryParam("12345"), false);
});
