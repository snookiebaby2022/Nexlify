import assert from "node:assert/strict";
import test from "node:test";
import crypto from "crypto";
import { verifyPlaybackToken } from "./playback-token";

test("verifyPlaybackToken accepts a matching HMAC and rejects a flipped bit", () => {
  const secret = "unit-test-playback-secret-32bytes!!";
  const exp = Math.floor(Date.now() / 1000) + 60;
  const payload = `line1|stream1|${exp}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex").slice(0, 24);
  const token = Buffer.from(`${exp}.${sig}`).toString("base64url");
  assert.equal(verifyPlaybackToken(token, { lineId: "line1", streamId: "stream1" }, secret), true);

  const badSig = sig.slice(0, -1) + (sig.endsWith("a") ? "b" : "a");
  const badToken = Buffer.from(`${exp}.${badSig}`).toString("base64url");
  assert.equal(verifyPlaybackToken(badToken, { lineId: "line1", streamId: "stream1" }, secret), false);
});
