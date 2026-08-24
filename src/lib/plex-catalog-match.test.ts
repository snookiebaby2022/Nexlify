import assert from "node:assert/strict";
import test from "node:test";
import {
  plexAutoSyncIsDue,
  plexCatalogTitleKey,
  plexScheduleHours,
  plexSeriesTitleKey,
} from "./plex-catalog-match";

test("plexCatalogTitleKey matches IPTV and Plex naming", () => {
  assert.equal(plexCatalogTitleKey("Inception"), plexCatalogTitleKey("Inception (Plex)"));
  assert.equal(plexCatalogTitleKey("Inception (2010)"), plexCatalogTitleKey("Inception | 1080p"));
  assert.equal(plexCatalogTitleKey("The Matrix (1999) 4K"), plexCatalogTitleKey("The Matrix"));
});

test("plexSeriesTitleKey uses series name and SxxExx prefixes", () => {
  assert.equal(
    plexSeriesTitleKey("Breaking Bad — S01E01 — Pilot (Plex)", "Breaking Bad"),
    plexCatalogTitleKey("Breaking Bad")
  );
  assert.equal(
    plexSeriesTitleKey("Breaking Bad S01E01 Pilot"),
    plexCatalogTitleKey("Breaking Bad")
  );
});

test("plexScheduleHours defaults to 12", () => {
  assert.equal(plexScheduleHours("24h"), 24);
  assert.equal(plexScheduleHours("12h"), 12);
  assert.equal(plexScheduleHours(""), 12);
});

test("plexAutoSyncIsDue respects 12h and 24h gaps", () => {
  const now = Date.parse("2026-08-24T14:00:00Z");
  assert.equal(plexAutoSyncIsDue(null, 12, now), true);
  assert.equal(plexAutoSyncIsDue(new Date(now - 13 * 3600_000).toISOString(), 12, now), true);
  assert.equal(plexAutoSyncIsDue(new Date(now - 2 * 3600_000).toISOString(), 12, now), false);
  assert.equal(plexAutoSyncIsDue(new Date(now - 20 * 3600_000).toISOString(), 24, now), false);
  assert.equal(plexAutoSyncIsDue(new Date(now - 25 * 3600_000).toISOString(), 24, now), true);
});
