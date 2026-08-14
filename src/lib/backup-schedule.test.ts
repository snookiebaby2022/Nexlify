import assert from "node:assert/strict";
import test from "node:test";
import { cronMatchesNow, cronMatchesThisHour } from "./backup-schedule";

test("cronMatchesThisHour ignores minute so hourly workers can hit daily schedules", () => {
  const at = new Date(Date.UTC(2026, 7, 14, 3, 54, 0));
  assert.equal(cronMatchesThisHour("0 3 * * *", at), true);
  assert.equal(cronMatchesNow("0 3 * * *", at), false);
});

test("cronMatchesThisHour rejects other UTC hours", () => {
  const at = new Date(Date.UTC(2026, 7, 14, 16, 54, 0));
  assert.equal(cronMatchesThisHour("0 4 * * *", at), false);
  assert.equal(cronMatchesThisHour("0 * * * *", at), true);
});
