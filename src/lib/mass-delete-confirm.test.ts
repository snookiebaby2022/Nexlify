import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertMassDeleteConfirm } from "./mass-delete-confirm";

describe("assertMassDeleteConfirm", () => {
  it("requires matching entity and count", () => {
    const ids = ["a", "b"];
    assert.equal(
      assertMassDeleteConfirm({ entity: "lines", ids, confirmEntity: "lines", confirmCount: 2 }).ok,
      true
    );
    assert.equal(
      assertMassDeleteConfirm({ entity: "lines", ids, confirmEntity: "users", confirmCount: 2 }).ok,
      false
    );
    assert.equal(
      assertMassDeleteConfirm({ entity: "lines", ids, confirmEntity: "lines", confirmCount: 1 }).ok,
      false
    );
    assert.equal(
      assertMassDeleteConfirm({ entity: "lines", ids, confirmEntity: "", confirmCount: 2 }).ok,
      false
    );
  });
});
