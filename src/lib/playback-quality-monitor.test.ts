import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyWatchRowForTest } from "./playback-quality-monitor";

test("classifyWatchRowForTest marks clustered short sessions as drops", () => {
  assert.equal(
    classifyWatchRowForTest({
      sessions: 11,
      under30s: 9,
      under2m: 9,
      avgSec: 68,
      stillFresh: 0,
    }),
    "drop"
  );
});

test("classifyWatchRowForTest marks stale long sessions as freeze", () => {
  assert.equal(
    classifyWatchRowForTest({
      sessions: 8,
      under30s: 0,
      under2m: 1,
      avgSec: 400,
      stillFresh: 0,
    }),
    "freeze"
  );
});

test("classifyWatchRowForTest leaves a healthy watch row alone", () => {
  assert.equal(
    classifyWatchRowForTest({
      sessions: 25,
      under30s: 0,
      under2m: 0,
      avgSec: 288,
      stillFresh: 20,
    }),
    null
  );
});
