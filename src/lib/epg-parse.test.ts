import assert from "node:assert/strict";
import test from "node:test";
import { parseXmltvDate } from "./epg";

test("parseXmltvDate respects XMLTV timezone offset", () => {
  const d = parseXmltvDate("20250819223000 +0100");
  assert.equal(d.toISOString(), "2025-08-19T21:30:00.000Z");
});

test("parseXmltvDate treats bare timestamp as UTC", () => {
  const d = parseXmltvDate("20250819223000 +0000");
  assert.equal(d.toISOString(), "2025-08-19T22:30:00.000Z");
});
