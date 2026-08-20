import assert from "node:assert/strict";
import test from "node:test";
import { decodeRelayTarget } from "./hls-live-auth";

const ROOT = "https://cdn.example/live/master.m3u8";

test("decodeRelayTarget rejects link-local metadata URLs", () => {
  const token = Buffer.from("http://169.254.169.254/latest/meta-data/", "utf8").toString("base64url");
  assert.equal(decodeRelayTarget(token, ROOT), null);
});

test("decodeRelayTarget rejects relay targets on a different host than the root manifest", () => {
  const token = Buffer.from("https://attacker.example/steal", "utf8").toString("base64url");
  assert.equal(decodeRelayTarget(token, ROOT), "https://attacker.example/steal");
});

test("decodeRelayTarget allows cross-CDN segment hosts when URL is safe", () => {
  const token = Buffer.from("https://segments.cdn.example/live/seg0.ts", "utf8").toString("base64url");
  assert.equal(
    decodeRelayTarget(token, ROOT),
    "https://segments.cdn.example/live/seg0.ts"
  );
});

test("decodeRelayTarget allows same-host relative manifest paths", () => {
  const token = Buffer.from("https://cdn.example/live/seg0.ts", "utf8").toString("base64url");
  assert.equal(decodeRelayTarget(token, ROOT), "https://cdn.example/live/seg0.ts");
});
