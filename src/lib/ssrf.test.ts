import assert from "node:assert/strict";
import test from "node:test";
import { isPrivateOrReservedIp } from "./ssrf";

test("isPrivateOrReservedIp blocks loopback, RFC1918, and metadata range", () => {
  assert.equal(isPrivateOrReservedIp("127.0.0.1"), true);
  assert.equal(isPrivateOrReservedIp("10.1.2.3"), true);
  assert.equal(isPrivateOrReservedIp("192.168.0.1"), true);
  assert.equal(isPrivateOrReservedIp("172.16.0.1"), true);
  assert.equal(isPrivateOrReservedIp("169.254.169.254"), true);
  assert.equal(isPrivateOrReservedIp("::1"), true);
  assert.equal(isPrivateOrReservedIp("8.8.8.8"), false);
  assert.equal(isPrivateOrReservedIp("1.1.1.1"), false);
});
