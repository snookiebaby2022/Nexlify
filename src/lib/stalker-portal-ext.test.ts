import assert from "node:assert/strict";
import test from "node:test";
import { STALKER_EXTENDED_ACTIONS } from "./stalker-portal-ext";

test("STALKER_EXTENDED_ACTIONS includes MAG portal essentials", () => {
  for (const action of [
    "get_modules",
    "get_all_channels",
    "get_short_epg",
    "get_pvr",
    "create_pvr",
    "get_tv_archive",
  ]) {
    assert.ok(STALKER_EXTENDED_ACTIONS.has(action), action);
  }
});
