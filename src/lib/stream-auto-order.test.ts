import assert from "node:assert/strict";
import { applyStreamAutoOrder, extractChannelNumber } from "./stream-auto-order";

assert.equal(extractChannelNumber("101 BBC One"), 101);
assert.equal(extractChannelNumber("Sky 401 Sports Mix"), 401);
assert.equal(extractChannelNumber("BBC One"), null);

const sky = applyStreamAutoOrder(
  [{ name: "Sky Sports News" }, { name: "101 BBC One HD" }, { name: "102 BBC Two" }],
  "sky-uk"
);
assert.deepEqual(
  sky.map((s) => s.name),
  ["101 BBC One HD", "102 BBC Two", "Sky Sports News"]
);

const usa = applyStreamAutoOrder(
  [{ name: "US | CBS" }, { name: "USA | ABC" }, { name: "NBC" }],
  "usa-az"
);
assert.deepEqual(
  usa.map((s) => s.name),
  ["USA | ABC", "US | CBS", "NBC"]
);

console.log("stream-auto-order.ts: ok");
