import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  livePlaylistEntryDedupeKey,
  liveTitleExactKey,
  liveTitleQualityKey,
} from "./live-title-dedupe";

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
