import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dedupeRedisLiveSessions,
  parseLiveSessionCacheKey,
} from "./live-session";

test("parseLiveSessionCacheKey reads IPv4 and wildcard keys", () => {
  assert.deepEqual(parseLiveSessionCacheKey("live:session:line1:stream2:1.2.3.4"), {
    lineId: "line1",
    streamId: "stream2",
    ip: "1.2.3.4",
  });
  assert.equal(parseLiveSessionCacheKey("live:session:line1:stream2:*")?.ip, null);
});

test("parseLiveSessionCacheKey keeps IPv6 remainder intact", () => {
  const key =
    "live:session:cmtline:cmtstream:2a02:c7c:6b57:7b00:fe63:b78:dce9:2b81";
  const parsed = parseLiveSessionCacheKey(key);
  assert.equal(parsed?.lineId, "cmtline");
  assert.equal(parsed?.streamId, "cmtstream");
  assert.equal(parsed?.ip, "2a02:c7c:6b57:7b00:fe63:b78:dce9:2b81");
});

test("dedupeRedisLiveSessions drops wildcard when a real IP exists for the same stream", () => {
  const rows = dedupeRedisLiveSessions([
    { lineId: "l1", streamId: "s1", ip: null },
    { lineId: "l1", streamId: "s1", ip: "81.105.200.177" },
    { lineId: "l2", streamId: "s9", ip: null },
  ]);
  assert.equal(rows.length, 2);
  assert.ok(rows.some((r) => r.lineId === "l1" && r.ip === "81.105.200.177"));
  assert.ok(rows.some((r) => r.lineId === "l2" && r.ip === null));
});
