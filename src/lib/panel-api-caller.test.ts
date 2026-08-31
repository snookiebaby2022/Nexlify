import assert from "node:assert/strict";
import test from "node:test";
import {
  RESELLER_PANEL_API_ACTIONS,
  assertPanelApiActionAllowed,
  callerFromUser,
  generatePanelApiKey,
  lineScopeWhere,
  resellerApiBaseUrl,
  userScopeWhere,
} from "./panel-api-caller";
import { PanelRole } from "@prisma/client";

test("generatePanelApiKey returns 48-char hex", () => {
  const key = generatePanelApiKey();
  assert.match(key, /^[0-9a-f]{48}$/);
});

test("resellerApiBaseUrl prefers resellerDns", () => {
  const caller = callerFromUser({
    id: "u1",
    username: "r1",
    role: PanelRole.RESELLER,
    resellerDns: "iptv.example.com",
  });
  assert.equal(resellerApiBaseUrl(caller, "https://panel.nexlify.live"), "https://iptv.example.com");
});

test("resellerApiBaseUrl normalizes malformed resellerDns", () => {
  const caller = callerFromUser({
    id: "u1",
    username: "r1",
    role: PanelRole.RESELLER,
    resellerDns: "http://iptv.example.com:2086/",
  });
  assert.equal(resellerApiBaseUrl(caller, "https://panel.nexlify.live"), "https://iptv.example.com");
});

test("resellerApiBaseUrl falls back to request origin", () => {
  const caller = callerFromUser({
    id: "u1",
    username: "r1",
    role: PanelRole.RESELLER,
    resellerDns: null,
  });
  assert.equal(resellerApiBaseUrl(caller, "https://panel.nexlify.live"), "https://panel.nexlify.live");
});

test("lineScopeWhere scopes to owner for resellers", () => {
  const admin = callerFromUser({ id: "a", username: "admin", role: PanelRole.ADMIN });
  const reseller = callerFromUser({ id: "r", username: "res", role: PanelRole.RESELLER });
  assert.deepEqual(lineScopeWhere(admin), {});
  assert.deepEqual(lineScopeWhere(reseller), { ownerId: "r" });
});

test("userScopeWhere includes self and children for resellers", () => {
  const reseller = callerFromUser({ id: "r", username: "res", role: PanelRole.RESELLER });
  assert.deepEqual(userScopeWhere(reseller), {
    OR: [{ id: "r" }, { parentId: "r" }],
  });
});

test("assertPanelApiActionAllowed blocks admin-only actions for resellers", () => {
  const reseller = callerFromUser({ id: "r", username: "res", role: PanelRole.RESELLER });
  assert.equal(assertPanelApiActionAllowed("get_lines", reseller).ok, true);
  assert.equal(assertPanelApiActionAllowed("create_bouquet", reseller).ok, false);
});

test("RESELLER_PANEL_API_ACTIONS includes line management", () => {
  for (const action of ["get_lines", "create_line", "add_credits", "user_info"]) {
    assert.ok(RESELLER_PANEL_API_ACTIONS.has(action), action);
  }
});
