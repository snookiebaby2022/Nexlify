import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isLiveOriginOrSpliceFailed,
  liveOriginOrSpliceError,
  liveOriginOrSpliceFailWhere,
} from "./stream-health-fail";

test("matches dashboard Issues for splice-only fails", () => {
  assert.equal(
    isLiveOriginOrSpliceFailed({
      lastProbeOk: true,
      lastProbeError: null,
      lastSpliceOk: false,
    }),
    true
  );
});

test("matches origin probe fails and ignores Viewer: stamps", () => {
  assert.equal(
    isLiveOriginOrSpliceFailed({
      lastProbeOk: false,
      lastProbeError: "ffprobe: Invalid data found",
      lastSpliceOk: true,
    }),
    true
  );
  assert.equal(
    isLiveOriginOrSpliceFailed({
      lastProbeOk: false,
      lastProbeError: "Viewer: zap failed",
      lastSpliceOk: true,
    }),
    false
  );
});

test("prefers probe error then splice for display", () => {
  assert.equal(
    liveOriginOrSpliceError({
      lastProbeError: "ffprobe bad",
      lastSpliceError: "Splice: 522",
    }),
    "ffprobe bad"
  );
  assert.equal(
    liveOriginOrSpliceError({
      lastProbeError: null,
      lastSpliceError: "Splice: upstream 522 and no backup left",
    }),
    "Splice: upstream 522 and no backup left"
  );
});

test("offline where includes splice OR probe", () => {
  const w = liveOriginOrSpliceFailWhere();
  assert.equal(w.type, "LIVE");
  assert.equal(w.isActive, true);
  assert.ok(Array.isArray(w.OR));
  assert.equal(w.OR.length, 2);
});
