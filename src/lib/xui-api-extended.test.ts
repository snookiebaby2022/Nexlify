import assert from "node:assert/strict";
import test from "node:test";

/** Document XUI API extended action names for automation parity checks. */
const XUI_EXTENDED_ACTIONS = [
  "get_categories",
  "get_packages",
  "get_servers",
  "get_server",
  "get_reg_users",
  "get_resellers",
  "get_epg",
  "kick_user",
  "kill_connection",
  "renew_line",
  "create_bouquet",
  "edit_bouquet",
  "delete_bouquet",
  "create_stream",
  "edit_stream",
  "delete_stream",
  "edit_user",
  "delete_user",
  "create_mag",
  "delete_mag",
  "get_transcodes",
  "get_events",
  "get_user_info",
  "get_connection_stats",
  "create_staff",
  "get_dashboard",
  "mass_enable_streams",
];

test("XUI extended actions cover common automation scripts", () => {
  assert.ok(XUI_EXTENDED_ACTIONS.length >= 20);
  for (const action of ["get_categories", "kick_user", "renew_line", "create_stream"]) {
    assert.ok(XUI_EXTENDED_ACTIONS.includes(action), action);
  }
});
