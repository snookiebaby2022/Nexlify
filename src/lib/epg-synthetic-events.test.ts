import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isEventStyleStreamName,
  parseEventFromStreamName,
  zonedWallTimeToUtc,
  SYNTHETIC_EPG_CHANNEL_PREFIX,
  isSyntheticEpgChannelId,
  syntheticEpgChannelIdForStream,
} from "./epg-synthetic-events";

describe("epg-synthetic-events", () => {
  const now = new Date("2026-03-28T15:00:00.000Z"); // Sat afternoon UTC
  const tz = "Europe/London";

  it("detects PPV / MLS / 24/7 / dated vs names", () => {
    assert.equal(isEventStyleStreamName("PPV 11 | Taylor vs Pili"), true);
    assert.equal(isEventStyleStreamName("MLS 15: St. Louis vs Dallas | Sun 30th March"), true);
    assert.equal(isEventStyleStreamName("24/7 Movies Action"), true);
    assert.equal(isEventStyleStreamName("Thu 19:00 | Arsenal vs Chelsea"), true);
    assert.equal(isEventStyleStreamName("Sky Sports Main Event"), false);
    assert.equal(isEventStyleStreamName("BBC One HD"), false);
  });

  it("parses PPV title and uses a live window when undated", () => {
    const p = parseEventFromStreamName("PPV 11 | Taylor vs Pili", { now, timeZone: tz });
    assert.ok(p);
    assert.equal(p!.kind, "ppv");
    assert.equal(p!.title, "Taylor vs Pili");
    assert.ok(p!.start.getTime() <= now.getTime());
    assert.ok(p!.stop.getTime() > now.getTime());
  });

  it("parses MLS with calendar date", () => {
    const p = parseEventFromStreamName(
      "MLS 15: St. Louis CITY SC vs Dallas FC | Sun 30th March",
      { now, timeZone: tz }
    );
    assert.ok(p);
    assert.equal(p!.kind, "mls");
    assert.match(p!.title, /St\. Louis CITY SC vs Dallas FC/i);
    const expected = zonedWallTimeToUtc(2026, 3, 30, 15, 0, tz);
    // No clock in name → uses "now" wall hour on that calendar day
    assert.equal(p!.start.toISOString(), expected.toISOString());
  });

  it("parses weekday + kickoff time", () => {
    const p = parseEventFromStreamName("Thu 19:00 | Arsenal vs Chelsea", {
      now,
      timeZone: tz,
    });
    assert.ok(p);
    assert.equal(p!.kind, "dated_match");
    assert.match(p!.title, /Arsenal vs Chelsea/i);
    // 2026-03-28 is Saturday → next Thu is April 2
    const expected = zonedWallTimeToUtc(2026, 4, 2, 19, 0, tz);
    assert.equal(p!.start.toISOString(), expected.toISOString());
  });

  it("builds rolling 24/7 windows", () => {
    const p = parseEventFromStreamName("24/7 Horror Movies", { now, timeZone: tz });
    assert.ok(p);
    assert.equal(p!.kind, "247");
    assert.ok(p!.stop.getTime() - p!.start.getTime() >= 23 * 3600_000);
  });

  it("synthetic channel ids are namespaced", () => {
    const id = syntheticEpgChannelIdForStream("clxyz123");
    assert.equal(id, `${SYNTHETIC_EPG_CHANNEL_PREFIX}clxyz123`);
    assert.equal(isSyntheticEpgChannelId(id), true);
    assert.equal(isSyntheticEpgChannelId("bbc.one.uk"), false);
  });
});
