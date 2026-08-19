import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultPanelServerSettings,
  getPanelServerSettingsSafe,
  parsePanelServerSettings,
} from "./panel-server";

test("getPanelServerSettingsSafe is exported as a function", () => {
  assert.equal(typeof getPanelServerSettingsSafe, "function");
});

test("default panel settings resolve without a database row", () => {
  const s = defaultPanelServerSettings();
  assert.equal(s.repoPath, "");
  assert.equal(s.updateHistory.length, 0);
  assert.equal(s.rollbackGitRef, null);
});

test("parsePanelServerSettings keeps an explicit repo path", () => {
  const s = parsePanelServerSettings({ repoPath: "/opt/nexlify-panel" });
  assert.equal(s.repoPath, "/opt/nexlify-panel");
});
