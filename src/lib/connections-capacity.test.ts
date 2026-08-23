import assert from "node:assert/strict";
import test from "node:test";
import { connectionCapacityAllows } from "./connections";

test("connectionCapacityAllows rejects a second simultaneous stream from the same IP on a 1-conn line", () => {
  // activeSessionCount=2: same IP on stream A + stream B (distinct ip|streamId groups)
  assert.equal(connectionCapacityAllows(2, 1, 2, "192.0.2.10"), false);
});

test("connectionCapacityAllows allows first session on a 1-conn line", () => {
  assert.equal(connectionCapacityAllows(0, 1, 0, "192.0.2.10"), true);
});

test("connectionCapacityAllows rejects a different IP when line is at capacity", () => {
  assert.equal(connectionCapacityAllows(1, 1, 0, "198.51.100.5"), false);
});

test("connectionCapacityAllows allows same IP channel switch on a 1-conn line at capacity", () => {
  assert.equal(connectionCapacityAllows(1, 1, 1, "192.0.2.10"), true);
});

test("connectionCapacityAllows treats maxConnections 0 as unlimited", () => {
  assert.equal(connectionCapacityAllows(99, 0, 99, "192.0.2.10"), true);
});

test("isTestConnectionIp identifies RFC5737 probe addresses", async () => {
  const { isTestConnectionIp } = await import("./connections");
  assert.equal(isTestConnectionIp("1.2.3.4"), true);
  assert.equal(isTestConnectionIp("203.0.113.50"), true);
  assert.equal(isTestConnectionIp("87.192.105.4"), false);
});
