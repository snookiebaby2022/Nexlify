import assert from "node:assert/strict";
import test from "node:test";
import { parseXmltvDate } from "./epg";

test("parseXmltvDate rejects malformed timestamps instead of silently using sync time", () => {
  assert.throws(() => parseXmltvDate("not-a-date"), /invalid|malformed/i);
});
