import assert from "node:assert/strict";
import test from "node:test";
import { buildPlexTranscodeM3u8, pickPlexPlaybackUrl } from "./plex-playback";

test("Plex movies and episodes both direct-play the file part when the profile allows it", () => {
  const profile = { preferDirectPlay: true, maxVideoBitrateKbps: 20000, videoResolution: "1920x1080" };
  const movie = pickPlexPlaybackUrl("http://plex:32400", "tok", {
    ratingKey: "10",
    type: "movie",
    Media: [{ Part: [{ key: "/library/parts/99/file.mkv" }] }],
  }, profile);
  assert.match(String(movie), /\/library\/parts\/99/);

  const episode = pickPlexPlaybackUrl("http://plex:32400", "tok", {
    ratingKey: "20",
    type: "episode",
    Media: [{ Part: [{ key: "/library/parts/88/file.mkv" }] }],
  }, profile);
  assert.match(String(episode), /\/library\/parts\/88/);
});

test("Plex transcode URL is HLS when direct play is off", () => {
  const url = buildPlexTranscodeM3u8("http://plex:32400", "tok", "33", {
    preferDirectPlay: false,
    maxVideoBitrateKbps: 4000,
    videoResolution: "1280x720",
  });
  assert.match(url, /protocol=hls/);
  assert.match(url, /directPlay=0/);
});
