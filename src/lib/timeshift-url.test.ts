import assert from "node:assert/strict";
import test from "node:test";
import { parseTimeshiftStart, xtreamTimeshiftSourceUrl } from "./timeshift-url";

test("parseTimeshiftStart accepts Xtream date and unix", () => {
  const a = parseTimeshiftStart("2026-08-17:14-30");
  assert.ok(a);
  assert.equal(a!.getUTCHours(), 14);
  assert.equal(a!.getUTCMinutes(), 30);
  const b = parseTimeshiftStart("1786972800");
  assert.ok(b);
});

test("xtreamTimeshiftSourceUrl rewrites live Xtream paths", () => {
  assert.equal(
    xtreamTimeshiftSourceUrl(
      "http://cdn.example:8080/live/user1/pass1/123.ts",
      6,
      "2026-08-17:14-30"
    ),
    "http://cdn.example:8080/timeshift/user1/pass1/6/2026-08-17:14-30/123.ts"
  );
  assert.equal(
    xtreamTimeshiftSourceUrl("https://junki3.example/Blade/key/602", 60, "1786972800")?.includes(
      "/timeshift/"
    ),
    true
  );
});
