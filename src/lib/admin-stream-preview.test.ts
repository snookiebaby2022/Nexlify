import assert from "node:assert/strict";
import test from "node:test";
import {
  adminPreviewWantsHls,
  adminProxyPlaybackPath,
  decodePreviewRelayTarget,
  encodePreviewRelayTarget,
  looksLikeHlsManifest,
  rewriteAdminHlsManifest,
  sanitizeAdminManifestBody,
} from "./admin-stream-preview";

test("adminProxyPlaybackPath supports hls=1 and relay targets", () => {
  const path = adminProxyPlaybackPath("tok123", {
    hls: true,
    relayTarget: "https://cdn.example/seg0.ts",
  });
  assert.match(path, /^\/api\/admin\/streams\/proxy\?/);
  assert.match(path, /t=tok123/);
  assert.match(path, /hls=1/);
  assert.match(path, /r=/);
});

test("encode/decode preview relay round-trip", () => {
  const u = "https://cdn.example/live/seg1.ts?token=abc";
  const enc = encodePreviewRelayTarget(u);
  assert.equal(decodePreviewRelayTarget(enc, "https://root.example/a.m3u8"), u);
  assert.equal(decodePreviewRelayTarget(null, "https://root.example/a.m3u8"), "https://root.example/a.m3u8");
});

test("adminPreviewWantsHls respects hls=1 for extensionless URLs", () => {
  assert.equal(adminPreviewWantsHls("https://cdn.example/live/user/pass/123", true), true);
  assert.equal(adminPreviewWantsHls("https://cdn.example/live/user/pass/123.ts", false), false);
  assert.equal(adminPreviewWantsHls("https://cdn.example/live/index.m3u8", false), true);
});

test("rewriteAdminHlsManifest rewrites segments and keys through relay", () => {
  const body = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"",
    "#EXTINF:2.0,",
    "seg0.ts",
    "variant.m3u8",
    "",
  ].join("\n");
  const out = rewriteAdminHlsManifest(body, "https://cdn.example/live/index.m3u8", (u) => `/proxy?u=${encodeURIComponent(u)}`);
  assert.match(out, /proxy\?u=/);
  assert.match(out, /seg0\.ts/);
  assert.match(out, /variant\.m3u8/);
  assert.match(out, /key\.bin/);
});

test("looksLikeHlsManifest detects playlists", () => {
  assert.equal(looksLikeHlsManifest("#EXTM3U\n#EXTINF:2,\nseg.ts\n", "application/octet-stream", false), true);
  assert.equal(looksLikeHlsManifest("474040", "video/mp2t", false), false);
  assert.equal(looksLikeHlsManifest("474040", "video/mp2t", true), true);
});

test("sanitizeAdminManifestBody strips DISCONTINUITY", () => {
  const out = sanitizeAdminManifestBody("#EXTM3U\n#EXT-X-DISCONTINUITY\n#EXTINF:2,\nseg.ts\n");
  assert.equal(out.includes("DISCONTINUITY"), false);
});
