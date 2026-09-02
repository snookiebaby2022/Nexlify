import assert from "node:assert/strict";
import test from "node:test";
import { PanelRole } from "@prisma/client";
import { isAdminRole, adminOrOwnerWhere } from "./admin-access";
import {
  RESELLER_PERMS,
  describeResellerPermission,
  hasResellerPermission,
} from "./reseller-permissions";

test("isAdminRole — admin bypasses ownership gates", () => {
  assert.equal(isAdminRole(PanelRole.ADMIN), true);
  assert.equal(isAdminRole(PanelRole.RESELLER), false);
});

test("adminOrOwnerWhere — admin sees any row", () => {
  assert.deepEqual(adminOrOwnerWhere({ role: PanelRole.ADMIN, id: "a1" }, "line-1"), { id: "line-1" });
  assert.deepEqual(adminOrOwnerWhere({ role: PanelRole.RESELLER, id: "r1" }, "line-1"), {
    id: "line-1",
    ownerId: "r1",
  });
});

test("describeResellerPermission — known labels", () => {
  assert.equal(describeResellerPermission(RESELLER_PERMS.LINES_CREATE), "Create lines");
  assert.equal(describeResellerPermission(RESELLER_PERMS.CONNECTIONS_KICK), "Kick live connections");
});

test("hasResellerPermission — admin always allowed", async () => {
  const ok = await hasResellerPermission({ id: "admin", role: PanelRole.ADMIN }, RESELLER_PERMS.LINES_DELETE);
  assert.equal(ok, true);
});
