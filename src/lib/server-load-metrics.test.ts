import assert from "node:assert/strict";
import test from "node:test";
import { bufferingRisk, bufferingRiskLabel } from "./server-load-metrics";

test("bufferingRisk classifies healthy capacity", () => {
  assert.equal(bufferingRisk({ online: true, saturated: false, headroomPct: 65, loadPct: 30 }), "healthy");
  assert.equal(bufferingRiskLabel("healthy"), "Healthy");
});

test("bufferingRisk warns before saturation", () => {
  assert.equal(bufferingRisk({ online: true, saturated: false, headroomPct: 35, loadPct: 60 }), "watch");
  assert.equal(bufferingRiskLabel("watch"), "Watch closely");
});

test("bufferingRisk is critical for offline or saturated delivery", () => {
  assert.equal(bufferingRisk({ online: false, saturated: false, headroomPct: 90, loadPct: 10 }), "critical");
  assert.equal(bufferingRisk({ online: true, saturated: true, headroomPct: 25, loadPct: 72, failedStreams: 1 }), "critical");
  assert.equal(bufferingRiskLabel("critical"), "High buffering risk");
});
