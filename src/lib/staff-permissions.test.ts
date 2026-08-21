import assert from "node:assert/strict";
import test from "node:test";
import {
  PERMS,
  STAFF_PRESETS,
  hasPermission,
  permissionsForPreset,
} from "./staff-permissions";

test("hasPermission — admin has all permissions", () => {
  assert.equal(hasPermission({ role: "ADMIN", permissions: [] }, PERMS.DVR_WRITE), true);
});

test("hasPermission — staff limited to assigned permissions", () => {
  const user = { role: "STAFF" as const, permissions: [PERMS.LINES_READ, PERMS.CONNECTIONS_KICK] };
  assert.equal(hasPermission(user, PERMS.LINES_READ), true);
  assert.equal(hasPermission(user, PERMS.STREAMS_WRITE), false);
});

test("permissionsForPreset — support agent preset", () => {
  const perms = permissionsForPreset("support_agent");
  assert.ok(perms.includes(PERMS.TICKETS_READ));
  assert.ok(STAFF_PRESETS.support_agent.includes(PERMS.CONNECTIONS_KICK));
});
