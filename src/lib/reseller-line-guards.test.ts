import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickResellerLineBouquetIds } from "./reseller-line-guards";

describe("pickResellerLineBouquetIds", () => {
  it("keeps requested IDs that are allowed", () => {
    assert.deepEqual(pickResellerLineBouquetIds(["a", "b", "c"], ["b", "x"]), ["b"]);
  });

  it("defaults to all allowed when package lists admin-only bouquets", () => {
    assert.deepEqual(pickResellerLineBouquetIds(["a", "b"], ["x", "y"]), ["a", "b"]);
  });

  it("dedupes requested IDs", () => {
    assert.deepEqual(pickResellerLineBouquetIds(["a", "b"], ["a", "a", "b"]), ["a", "b"]);
  });

  it("returns empty when no bouquets are allowed", () => {
    assert.deepEqual(pickResellerLineBouquetIds([], ["a"]), []);
  });
});
