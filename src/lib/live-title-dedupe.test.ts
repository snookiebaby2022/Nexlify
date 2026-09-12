import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  liveAliasDuplicateKey,
  liveCanonicalChannelKey,
  liveExactDuplicateKey,
  livePlaylistEntryDedupeKey,
  liveStreamQualityTier,
  liveTitleExactKey,
  liveTitleQualityKey,
} from "./live-title-dedupe";
import { buildDuplicateGroups, type DuplicateScanRow } from "./stream-duplicates";

describe("livePlaylistEntryDedupeKey", () => {
  it("treats FHD/HD/SD Xtream ids as separate streams", () => {
    const fhd = "https://nowtvgo.online/live/u/p/5631944.ts";
    const hd = "https://nowtvgo.online/live/u/p/5631945.ts";
    const sd = "https://nowtvgo.online/live/u/p/5631946.ts";
    const kF = livePlaylistEntryDedupeKey(fhd);
    const kH = livePlaylistEntryDedupeKey(hd);
    const kS = livePlaylistEntryDedupeKey(sd);
    assert.notEqual(kF, kH);
    assert.notEqual(kH, kS);
    assert.notEqual(kF, kS);
  });

  it("collapses same stream id with different extensions", () => {
    const ts = "http://x96.pro:8880/live/u/p/12.ts";
    const m3u8 = "http://x96.pro:8880/live/u/p/12.m3u8";
    assert.equal(livePlaylistEntryDedupeKey(ts), livePlaylistEntryDedupeKey(m3u8));
  });
});

describe("liveTitleExactKey vs liveTitleQualityKey", () => {
  it("keeps quality variants distinct for exact title checks", () => {
    assert.notEqual(
      liveTitleExactKey("Sky Sports Main Event FHD"),
      liveTitleExactKey("Sky Sports Main Event HD")
    );
    assert.equal(
      liveTitleQualityKey("Sky Sports Main Event FHD"),
      liveTitleQualityKey("Sky Sports Main Event HD")
    );
  });
});

describe("live duplicate grouping keys", () => {
  const cat = "cat-uk-movies";

  it("groups UK raw name with FHD alias, not HD", () => {
    const fhd = liveAliasDuplicateKey("Sky Cinema Premiere FHD", cat);
    const uk = liveAliasDuplicateKey("UK: SKY CINEMA PREMIERE", cat);
    const hd = liveAliasDuplicateKey("Sky Cinema Premiere HD", cat);
    assert.equal(fhd, uk);
    assert.notEqual(fhd, hd);
  });

  it("keeps exact duplicate names in same category together", () => {
    const a = liveExactDuplicateKey("Sky Cinema Premiere HD", cat);
    const b = liveExactDuplicateKey("Sky Cinema Premiere HD", cat);
    assert.equal(a, b);
  });

  it("does not merge same name across categories", () => {
    assert.notEqual(
      liveExactDuplicateKey("Sky Cinema Premiere HD", "cat-a"),
      liveExactDuplicateKey("Sky Cinema Premiere HD", "cat-b")
    );
  });

  it("canonical key strips UK prefix", () => {
    assert.equal(
      liveCanonicalChannelKey("UK: SKY CINEMA PREMIERE"),
      liveCanonicalChannelKey("Sky Cinema Premiere")
    );
  });

  it("keeps +1 timeshift channels distinct from the parent", () => {
    assert.notEqual(
      liveCanonicalChannelKey("BBC One HD"),
      liveCanonicalChannelKey("BBC One +1 HD")
    );
    assert.notEqual(
      liveAliasDuplicateKey("BBC One HD", cat),
      liveAliasDuplicateKey("BBC One +1 HD", cat)
    );
  });

  it("buildDuplicateGroups finds alias and exact live dupes", () => {
    const rows: DuplicateScanRow[] = [
      {
        id: "1",
        name: "Sky Cinema Premiere FHD",
        streamUrl: "http://x/1.ts",
        type: "LIVE",
        seriesName: null,
        seasonNum: null,
        episodeNum: null,
        isActive: true,
        categoryId: cat,
        categoryName: "UK | Movies",
        bouquetCount: 1,
        createdAt: new Date("2020-01-01"),
        hasIcon: true,
      },
      {
        id: "2",
        name: "UK: SKY CINEMA PREMIERE",
        streamUrl: "http://x/2.ts",
        type: "LIVE",
        seriesName: null,
        seasonNum: null,
        episodeNum: null,
        isActive: true,
        categoryId: cat,
        categoryName: "UK | Movies",
        bouquetCount: 0,
        createdAt: new Date("2021-01-01"),
      },
      {
        id: "3",
        name: "Sky Cinema Premiere HD",
        streamUrl: "http://x/3.ts",
        type: "LIVE",
        seriesName: null,
        seasonNum: null,
        episodeNum: null,
        isActive: true,
        categoryId: cat,
        categoryName: "UK | Movies",
        bouquetCount: 0,
        createdAt: new Date("2020-06-01"),
      },
      {
        id: "4",
        name: "Sky Cinema Premiere HD",
        streamUrl: "http://x/4.ts",
        type: "LIVE",
        seriesName: null,
        seasonNum: null,
        episodeNum: null,
        isActive: true,
        categoryId: cat,
        categoryName: "UK | Movies",
        bouquetCount: 0,
        createdAt: new Date("2020-07-01"),
      },
    ];
    const groups = buildDuplicateGroups(rows, "live");
    const alias = groups.find((g) => g.reason === "alias");
    const title = groups.find((g) => g.reason === "title");
    assert.ok(alias);
    assert.equal(alias!.members.length, 2);
    assert.ok(title);
    assert.equal(title!.members.length, 2);
    assert.equal(liveStreamQualityTier("Sky Cinema Premiere HD"), "hd");
  });
});
