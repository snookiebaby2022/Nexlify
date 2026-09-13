import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PanelRole } from "@prisma/client";
import { adminOrLineOwnerWhere } from "./line-owner-filter";
import type { SessionUser } from "./auth";

describe("adminOrLineOwnerWhere", () => {
  it("admins are unscoped by owner (watch/webplayer IDOR gate)", async () => {
    const session = { id: "admin-1", role: PanelRole.ADMIN } as SessionUser;
    assert.deepEqual(await adminOrLineOwnerWhere(session, "line-1"), { id: "line-1" });
  });
});
