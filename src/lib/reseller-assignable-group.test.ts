import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resellerMayAssignGroup } from "./reseller-assignable-group";

describe("resellerMayAssignGroup", () => {
  it("rejects missing groups", () => {
    const r = resellerMayAssignGroup(null, new Set(["lines.view"]));
    assert.equal(r.ok, false);
  });

  it("rejects reseller/admin groups", () => {
    const r = resellerMayAssignGroup(
      { name: "Resellers", isReseller: true, config: { groupRole: "reseller", permissions: ["lines.view"] } },
      new Set(["lines.view"])
    );
    assert.equal(r.ok, false);
  });

  it("rejects empty explicit permission lists", () => {
    const r = resellerMayAssignGroup(
      { name: "Sub-reseller", isReseller: true, config: { groupRole: "sub_reseller", permissions: [] } },
      new Set(["lines.view", "lines.edit"])
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /explicit permissions/);
  });

  it("rejects a group that grants a permission the parent lacks", () => {
    const r = resellerMayAssignGroup(
      {
        name: "Sub-reseller",
        isReseller: true,
        config: { groupRole: "sub_reseller", permissions: ["lines.view", "credits.transfer"] },
      },
      new Set(["lines.view"])
    );
    assert.equal(r.ok, false);
  });

  it("allows a sub-reseller group whose perms are a subset", () => {
    const r = resellerMayAssignGroup(
      {
        name: "Sub-reseller",
        isReseller: true,
        config: { groupRole: "sub_reseller", permissions: ["lines.view"] },
      },
      new Set(["lines.view", "lines.edit"])
    );
    assert.equal(r.ok, true);
  });
});
