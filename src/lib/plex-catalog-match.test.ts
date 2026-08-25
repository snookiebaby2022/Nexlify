import assert from "node:assert/strict";
import test from "node:test";
import { matchVodBouquetId } from "./integration-bouquet";
import {
  plexAutoSyncIsDue,
  plexCatalogTitleKey,
  plexGenreName,
  plexScheduleHours,
  plexSeriesTitleKey,
  plexVodMetaFromItem,
} from "./plex-catalog-match";

test("matchVodBouquetId prefers VOD for movies and TV Series for series", () => {
  const bouquets = [
    { id: "p", name: "Plugin imports" },
    { id: "m", name: "Movies" },
    { id: "s", name: "TV Series" },
    { id: "v", name: "VOD" },
  ];
  assert.equal(matchVodBouquetId("MOVIE", bouquets), "v");
  assert.equal(matchVodBouquetId("SERIES", bouquets), "s");
  assert.equal(matchVodBouquetId("MOVIE", [{ id: "m", name: "Movies" }]), "m");
  assert.equal(matchVodBouquetId("MOVIE", [{ id: "v", name: "VOD" }]), "v");
});

test("plexVodMetaFromItem copies plot, year, duration, and tags", () => {
  const meta = plexVodMetaFromItem({
    summary: "A chemistry teacher turns to crime.",
    year: 2008,
    audienceRating: 9.5,
    originallyAvailableAt: "2008-01-20",
    duration: 2_880_000,
    Genre: [{ tag: "Crime" }],
    Role: [{ tag: "Bryan Cranston" }],
    Director: [{ tag: "Vince Gilligan" }],
  });
  assert.equal(meta.plot, "A chemistry teacher turns to crime.");
  assert.equal(meta.releaseDate, "2008-01-20");
  assert.equal(meta.cast, "Bryan Cranston");
  assert.equal(meta.director, "Vince Gilligan");
  assert.equal(meta.genre, "Crime");
  assert.equal(meta.durationSecs, 2880);
});

test("plexGenreName reads Plex Genre tags", () => {
  assert.equal(plexGenreName({ Genre: [{ tag: "Action" }, { tag: "Sci-Fi" }] }), "Action");
  assert.equal(plexGenreName({ Genre: ["Drama"] }), "Drama");
  assert.equal(plexGenreName({}), null);
});

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
