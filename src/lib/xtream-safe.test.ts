import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  xtreamSafeText,
  xtreamUnix,
  xtreamDeltaArray,
  xtreamOutputFormats,
  xtreamCategoryIds,
  xmltvSafeText,
  xtreamBase64,
  xtreamCatalogDirectSource,
  xtreamListingExtension,
} from "./xtream-safe";

describe("xtream-safe", () => {
  it("strips control characters that crash XCIPTV JSON parsers", () => {
    assert.equal(xtreamSafeText("Sky\u0000 Sport\u0007"), "Sky Sport");
  });

  it("never emits NaN unix timestamps", () => {
    assert.equal(xtreamUnix(new Date("invalid")), 0);
    const d = new Date("2026-08-19T00:00:00Z");
    assert.equal(xtreamUnix(d), Math.floor(d.getTime() / 1000));
  });

  it("keeps catalog responses as arrays when timestamp is set", () => {
    const rows = [
      { name: "a", updated_at: 10 },
      { name: "b", updated_at: 50 },
    ];
    const filtered = xtreamDeltaArray(rows, 20, (r) => r.updated_at);
    assert.ok(Array.isArray(filtered));
    assert.deepEqual(
      filtered.map((r) => r.name),
      ["b"]
    );
    assert.equal(xtreamDeltaArray(rows, 0, (r) => r.updated_at).length, 2);
  });

  it("maps hls to m3u8 so XCIPTV does not request a .hls container", () => {
    assert.deepEqual(xtreamOutputFormats("hls,m3u8,ts,rtmp"), ["m3u8", "ts", "rtmp"]);
  });

  it("uses numeric category_ids like XUI", () => {
    assert.deepEqual(xtreamCategoryIds("162563989"), [162563989]);
  });

  it("escapes XML and drops illegal control chars", () => {
    assert.equal(xmltvSafeText('A <B> & "C"\u0001'), "A &lt;B&gt; &amp; &quot;C&quot;");
  });

  it("base64-encodes EPG titles the way Xtream/XUI do", () => {
    assert.equal(xtreamBase64("News"), Buffer.from("News", "utf8").toString("base64"));
  });

  it("never puts a playback URL on Xtream catalog listings", () => {
    assert.equal(xtreamCatalogDirectSource(), "");
  });

  it("reads VOD container_extension without parsing a source URL", () => {
    assert.equal(xtreamListingExtension("mkv"), "mkv");
    assert.equal(xtreamListingExtension(".MP4"), "mp4");
    assert.equal(xtreamListingExtension("hls"), "m3u8");
    assert.equal(xtreamListingExtension(""), "mp4");
  });
});
