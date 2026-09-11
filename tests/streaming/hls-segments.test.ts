import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  instantLiveTsHlsPlaylist,
  instantVodFileHlsPlaylist,
  markHlsPlaylistAsVod,
  sanitizeHlsPlaylist,
} from "../../src/lib/hls-playback";
import {
  filterPackagerPlaylistToExisting,
  isPackagerSegmentName,
  packagerDir,
  packagerLiveInputPrefix,
} from "../../src/lib/ts-hls-packager";

describe("HLS playlist generation", () => {
  it("builds a live instant playlist pointing at the TS URI", () => {
    const body = instantLiveTsHlsPlaylist("media.ts");
    assert.match(body, /#EXTM3U/);
    assert.match(body, /#EXT-X-TARGETDURATION:/);
    assert.match(body, /media\.ts/);
    assert.equal(body.includes("#EXT-X-ENDLIST"), false);
  });

  it("builds a VOD playlist with ENDLIST", () => {
    const body = instantVodFileHlsPlaylist("movie.mp4", 120);
    assert.match(body, /#EXT-X-PLAYLIST-TYPE:VOD/);
    assert.match(body, /#EXTINF:120/);
    assert.match(body, /#EXT-X-ENDLIST/);
  });

  it("sanitizes playlists and marks VOD without freezing tags", () => {
    const src = [
      "#EXTM3U",
      "#EXT-X-VERSION:7",
      "#EXT-X-DISCONTINUITY",
      "#EXT-X-INDEPENDENT-SEGMENTS",
      "#EXT-X-TARGETDURATION:2",
      "#EXTINF:2.04,",
      "seg0.ts",
      "#EXTINF:2.0,",
      "seg1.ts",
      "",
    ].join("\n");
    const cleaned = sanitizeHlsPlaylist(src);
    assert.equal(cleaned.includes("DISCONTINUITY"), false);
    assert.equal(cleaned.includes("INDEPENDENT-SEGMENTS"), false);
    assert.match(cleaned, /#EXT-X-VERSION:3/);
    assert.match(cleaned, /#EXT-X-TARGETDURATION:3/);

    const vod = markHlsPlaylistAsVod(cleaned);
    assert.match(vod, /#EXT-X-PLAYLIST-TYPE:VOD/);
  });

  it("does not pace live HTTP inputs with -re (first segment latency)", () => {
    assert.deepEqual(packagerLiveInputPrefix(), []);
    assert.deepEqual(packagerLiveInputPrefix({ vod: true }), []);
    assert.deepEqual(packagerLiveInputPrefix({ loop: true }), ["-re", "-stream_loop", "-1"]);
  });
});

describe("HLS segment cleanup", () => {
  const streamId = "hls-cleanup-test";
  let root: string;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "nexlify-hls-test-"));
    process.env.NEXLIFY_HLS_DIR = root;
  });

  after(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    delete process.env.NEXLIFY_HLS_DIR;
  });

  it("accepts only packager segment names", () => {
    assert.equal(isPackagerSegmentName("seg0.ts"), true);
    assert.equal(isPackagerSegmentName("seg12.ts"), true);
    assert.equal(isPackagerSegmentName("../etc/passwd"), false);
    assert.equal(isPackagerSegmentName("seg0.ts;rm"), false);
  });

  it("drops playlist entries for deleted/missing segments and orphan EXTINF", () => {
    const dir = packagerDir("line1", streamId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "seg1.ts"), Buffer.alloc(188));
    writeFileSync(join(dir, "seg2.ts"), Buffer.alloc(188));
    // seg0 intentionally missing (old segment cleaned up on disk)

    const playlist = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:1",
      "#EXT-X-DISCONTINUITY",
      "#EXTINF:1.0,",
      "seg0.ts",
      "#EXTINF:1.0,",
      "seg1.ts",
      "#EXTINF:1.0,",
      "seg2.ts",
      "",
    ].join("\n");

    const filtered = filterPackagerPlaylistToExisting(playlist, "line1", streamId);
    assert.equal(filtered.includes("seg0.ts"), false);
    assert.match(filtered, /seg1\.ts/);
    assert.match(filtered, /seg2\.ts/);
    assert.equal(filtered.includes("DISCONTINUITY"), false);
    // Orphan EXTINF for missing seg0 must be removed with the URI.
    const lines = filtered.split("\n").map((l) => l.trim()).filter(Boolean);
    const seg1At = lines.indexOf("seg1.ts");
    assert.ok(seg1At > 0);
    assert.match(lines[seg1At - 1]!, /^#EXTINF/);
  });
});
