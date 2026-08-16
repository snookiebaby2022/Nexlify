import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PanelRole } from "@prisma/client";
import { pickBouquetIdsForNewReseller } from "./reseller-bouquets";

describe("pickBouquetIdsForNewReseller", () => {
  it("uses explicit ids when provided", () => {
    assert.deepEqual(
      pickBouquetIdsForNewReseller({
        role: PanelRole.RESELLER,
        explicitIds: ["a", "b", "a"],
        parentIds: ["p"],
        allActiveIds: ["x", "y"],
      }),
      ["a", "b"]
    );
  });

  it("gives resellers all active bouquets", () => {
    assert.deepEqual(
      pickBouquetIdsForNewReseller({
        role: PanelRole.RESELLER,
        explicitIds: [],
        parentIds: [],
        allActiveIds: ["1", "2"],
      }),
      ["1", "2"]
    );
  });

  it("gives sub-resellers parent bouquets when present", () => {
    assert.deepEqual(
      pickBouquetIdsForNewReseller({
        role: PanelRole.SUB_RESELLER,
        explicitIds: [],
        parentIds: ["p1"],
        allActiveIds: ["1", "2"],
      }),
      ["p1"]
    );
  });

  it("falls back to all active for sub-reseller with empty parent set", () => {
    assert.deepEqual(
      pickBouquetIdsForNewReseller({
        role: PanelRole.SUB_RESELLER,
        explicitIds: [],
        parentIds: [],
        allActiveIds: ["1", "2"],
      }),
      ["1", "2"]
    );
  });
});
