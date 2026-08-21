import assert from "node:assert/strict";
import test from "node:test";
import { streamServerDisplayName } from "./stream-server-display";

test("streamServerDisplayName replaces version-like migration labels with host", () => {
  assert.equal(streamServerDisplayName("1.5.13", "154.6.193.156"), "154.6.193.156");
  assert.equal(streamServerDisplayName("Main Server", "45.88.138.18"), "Main Server");
  assert.equal(streamServerDisplayName("45.88.138.18", "45.88.138.18"), "45.88.138.18");
});
