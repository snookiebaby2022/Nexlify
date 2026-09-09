import assert from "node:assert/strict";
import test from "node:test";
import { connectionCapacityAllows } from "./connections";

test("connectionCapacityAllows allows first session on a 1-conn line", () => {
  assert.equal(connectionCapacityAllows(0, 1, 0, "192.0.2.10"), true);
});

test("connectionCapacityAllows rejects a different IP when line is at capacity", () => {
  assert.equal(connectionCapacityAllows(1, 1, 0, "198.51.100.5"), false);
});

test("connectionCapacityAllows allows same-stream reconnect at capacity", () => {
  assert.equal(connectionCapacityAllows(1, 1, 1, "192.0.2.10", true), true);
});

test("connectionCapacityAllows allows existing IP to zap when at capacity", () => {
  // active=1 max=1, same IP already holds 1 session — zap/replace, not a new device
  assert.equal(connectionCapacityAllows(1, 1, 1, "192.0.2.10", false), true);
});

test("connectionCapacityAllows rejects brand-new IP at capacity even if sameIpDistinctSessions miscounted", () => {
  assert.equal(connectionCapacityAllows(2, 2, 0, "198.51.100.9", false), false);
});

test("connectionCapacityAllows allows second device when under maxConnections=2", () => {
  assert.equal(connectionCapacityAllows(1, 2, 0, "198.51.100.5"), true);
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
