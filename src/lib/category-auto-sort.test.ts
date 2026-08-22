import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAutoSortUpdates,
  categorySortTier,
  compareCategoriesForAutoSort,
  resolveSortLines,
} from "./category-auto-sort";

test("categorySortTier prioritizes UK before sports before US", () => {
  const lines = resolveSortLines("uk-sports-us");
  assert.ok(categorySortTier("UK | Entertainment", lines) < categorySortTier("Sports HD", lines));
  assert.ok(categorySortTier("Sports HD", lines) < categorySortTier("US | Entertainment", lines));
  assert.equal(categorySortTier("ZZ Misc", lines), lines.length);
});

test("buildAutoSortUpdates reorders siblings only", () => {
  const cats = [
    { id: "a", name: "US Movies", parentId: null, sortOrder: 0 },
    { id: "b", name: "UK Entertainment", parentId: null, sortOrder: 1 },
    { id: "c", name: "US Sports", parentId: "p1", sortOrder: 0 },
    { id: "d", name: "UK Sports", parentId: "p1", sortOrder: 1 },
  ];
  const updates = buildAutoSortUpdates(cats, resolveSortLines("uk-sports-us"));
  const order = new Map(updates.map((u) => [u.id, u.sortOrder]));
  assert.equal(order.get("b"), 0);
  assert.equal(order.get("a"), 1);
  assert.equal(order.get("d"), 0);
  assert.equal(order.get("c"), 1);
});

test("operator-order preset puts UK Sky tiers before US and 24/7", () => {
  const lines = resolveSortLines("operator-order");
  assert.ok(
    categorySortTier("UK | Entertainment", lines) <
      categorySortTier("US | Entertainment", lines)
  );
  assert.ok(
    categorySortTier("US | Entertainment", lines) <
      categorySortTier("24/7 Movies", lines)
  );
  assert.ok(categorySortTier("ZZ Misc", lines) === lines.length);
});

test("compareCategoriesForAutoSort falls back to name within tier", () => {
  const lines = resolveSortLines("uk-sports-us");
  assert.ok(
    compareCategoriesForAutoSort(
      { name: "UK | Movies", sortOrder: 5 },
      { name: "UK | Entertainment", sortOrder: 0 },
      lines
    ) > 0
  );
});
