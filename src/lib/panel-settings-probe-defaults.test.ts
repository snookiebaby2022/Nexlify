import assert from "node:assert/strict";
import test from "node:test";
import { instantStreamingPanelDefaults } from "./panel-settings";

test("new installs keep stream probes off until an operator clicks a failing channel", () => {
  const d = instantStreamingPanelDefaults();
  assert.equal(d.streams?.autoFixDeadLinks, false);
  assert.equal(d.cron?.deadLinkProbeEnabled, false);
  assert.equal(d["auto-fix"]?.autoFixEnabled, false);
  assert.equal(d["auto-fix"]?.autoFixSourceSwitch, false);
  assert.equal(d["source-swap"]?.sourceSwapEnabled, false);
  assert.equal(d["source-monitor"]?.sourceMonitorEnabled, false);
  assert.equal(d["performance-core"]?.perfStreamPreload, false);
  assert.equal(d["nginx-cache"]?.enabled, false);
  assert.equal(d["nginx-cache"]?.cacheSize, "256m");
});
