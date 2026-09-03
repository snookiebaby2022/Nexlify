import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  xtreamSafeText,
  xtreamUnix,
  xtreamAddedUnix,
  xtreamDeltaArray,
  xtreamOutputFormats,
  xtreamCategoryIds,
  xtreamExportCategoryId,
  xmltvSafeText,
  xtreamBase64,
  xtreamCatalogDirectSource,
  xtreamListingExtension,
  mediaExtensionFromUrl,
  xtreamM3uAttr,
  xtreamM3uFilename,
} from "./xtream-safe";

describe("xtream-safe", () => {
  it("strips control characters that crash XCIPTV JSON parsers", () => {
    assert.equal(xtreamSafeText("Sky\u0000 Sport\u0007"), "Sky Sport");
  });

  it("uses createdAt for Xtream added so XCIPTV Latest Movies shows panel-added titles", () => {
    const created = new Date("2026-08-30T12:00:00Z");
    const updated = new Date("2026-09-01T12:00:00Z");
    assert.equal(xtreamAddedUnix(created, updated), Math.floor(created.getTime() / 1000));
  });

  it("falls back to updatedAt when createdAt is missing", () => {
    const updated = new Date("2026-08-30T12:00:00Z");
    assert.equal(xtreamAddedUnix(null, updated), Math.floor(updated.getTime() / 1000));
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

  it("exports numeric category_ids like XUI", () => {
    assert.deepEqual(xtreamCategoryIds("162563989"), [162563989]);
  });

  it("exports string category_id for SQLite-friendly IPTV apps", () => {
    assert.equal(xtreamExportCategoryId("707056019"), "707056019");
    assert.equal(xtreamExportCategoryId("0"), "0");
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

  it("prefers a real file extension from the source URL over a default mp4 listing", () => {
    assert.equal(mediaExtensionFromUrl("https://cdn.example/movie/1.mkv"), "mkv");
    assert.equal(xtreamListingExtension("mp4", "mp4", "https://cdn.example/movie/1.mkv"), "mkv");
    assert.equal(xtreamListingExtension("mkv", "mp4", "https://cdn.example/movie/1.mp4"), "mkv");
  });

  it("does not advertise m3u8 when the source file is mkv/mp4", () => {
    assert.equal(xtreamListingExtension("m3u8", "mp4", "https://cdn.example/movie/1.mkv"), "mkv");
    assert.equal(xtreamListingExtension("hls", "mp4", "https://cdn.example/series/1.mp4"), "mp4");
  });

  it("escapes M3U attributes and playlist filenames like XUI get.php", () => {
    assert.equal(xtreamM3uAttr('UK "HD"\nNews'), "UK 'HD' News");
    assert.equal(xtreamM3uFilename('user"\r\nname'), "user_name.m3u");
    assert.equal(xtreamM3uFilename(""), "playlist.m3u");
  });
});
