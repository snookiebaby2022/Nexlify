import assert from "node:assert/strict";
import test from "node:test";
import {
  formatEpgTimeRange,
  formatPanelClock,
  formatXtreamEpgDateTime,
  formatXmltvDateInTimezone,
  formatXmltvDateUtc,
  formatXmltvDateXui,
  normalizeTimeFormat,
} from "./epg-time";

const sample = new Date("2025-08-19T21:30:00.000Z");

test("formatXtreamEpgDateTime uses panel timezone (BST)", () => {
  assert.equal(
    formatXtreamEpgDateTime(sample, { timezone: "Europe/London", timeFormat: "24" }),
    "2025-08-19 22:30:00"
  );
});

test("formatXtreamEpgDateTime supports 12-hour clock", () => {
  const out = formatXtreamEpgDateTime(sample, { timezone: "Europe/London", timeFormat: "12" });
  assert.match(out, /^2025-08-19 10:30:00 PM$/);
});

test("formatEpgTimeRange respects 12/24h", () => {
  const end = new Date("2025-08-19T22:00:00.000Z");
  assert.equal(
    formatEpgTimeRange(sample, end, { timezone: "Europe/London", timeFormat: "24" }),
    "22:30 - 23:00"
  );
  const twelve = formatEpgTimeRange(sample, end, { timezone: "Europe/London", timeFormat: "12" });
  assert.match(twelve, /10:30 pm - 11:00 pm/i);
});

test("formatXmltvDateInTimezone includes offset", () => {
  const out = formatXmltvDateInTimezone(sample, "Europe/London");
  assert.match(out, /^20250819223000 \+0\d00$/);
});

test("formatXmltvDateUtc is true UTC", () => {
  assert.equal(formatXmltvDateUtc(sample), "20250819213000 +0000");
});

test("formatXmltvDateXui is London wall clock with dummy +0000 for XCIPTV", () => {
  assert.equal(formatXmltvDateXui(sample, "Europe/London"), "20250819223000 +0000");
});

test("normalizeTimeFormat", () => {
  assert.equal(normalizeTimeFormat("12h"), "12");
  assert.equal(normalizeTimeFormat("24"), "24");
  assert.equal(normalizeTimeFormat(undefined), "24");
});

test("formatPanelClock matches xtream epg datetime", () => {
  assert.equal(
    formatPanelClock(sample, { timezone: "Europe/London", timeFormat: "24" }),
    formatXtreamEpgDateTime(sample, { timezone: "Europe/London", timeFormat: "24" })
  );
});
