import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keepExistingBouquetIds } from "./package-line";

describe("keepExistingBouquetIds", () => {
  it("drops IDs that are not in the catalog", () => {
    assert.deepEqual(keepExistingBouquetIds(["a", "gone", "b"], ["a", "b"]), ["a", "b"]);
  });

  it("dedupes and ignores blanks", () => {
    assert.deepEqual(keepExistingBouquetIds(["a", "", "a"], ["a"]), ["a"]);
  });

  it("returns empty when every package bouquet was deleted", () => {
    assert.deepEqual(keepExistingBouquetIds(["gone"], ["a"]), []);
  });
});
