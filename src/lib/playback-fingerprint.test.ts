import assert from "node:assert/strict";
import test from "node:test";
import { computePlaybackFingerprint, playbackFingerprintAlgo } from "./playback-fingerprint";

test("playbackFingerprintAlgo maps UI values including sha1", () => {
  assert.equal(playbackFingerprintAlgo("sha1"), "sha1");
  assert.equal(playbackFingerprintAlgo("md5"), "md5");
  assert.equal(playbackFingerprintAlgo("sha256"), "sha256");
  assert.equal(playbackFingerprintAlgo("nope"), "sha256");
});

test("computePlaybackFingerprint is stable and algorithm-specific", () => {
  const sha = computePlaybackFingerprint("secret", "sha256", ["line1", "1.2.3.4"]);
  const sha1 = computePlaybackFingerprint("secret", "sha1", ["line1", "1.2.3.4"]);
  assert.equal(sha.length, 16);
  assert.equal(sha1.length, 16);
  assert.notEqual(sha, sha1);
  assert.equal(sha, computePlaybackFingerprint("secret", "sha256", ["line1", "1.2.3.4"]));
});
