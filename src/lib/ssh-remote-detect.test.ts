import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRemoteHardware } from "./ssh-remote-detect";

test("parseRemoteHardware reads iface gateway cpu and private ip", () => {
  const hw = parseRemoteHardware(
    "NEXLIFY_HW iface=ens3 gw=10.0.0.1 cpu=8 mem=16000 priv=10.0.0.20\nNEXLIFY_CPU_MODEL Intel Xeon"
  );
  assert.equal(hw.primaryInterface, "ens3");
  assert.equal(hw.gateway, "10.0.0.1");
  assert.equal(hw.cpuThreads, 8);
  assert.equal(hw.totalMemMb, 16000);
  assert.deepEqual(hw.ipv4, ["10.0.0.20"]);
  assert.equal(hw.cpuModel, "Intel Xeon");
});

test("parseRemoteHardware keeps speed field optional and avoids eth0 default", () => {
  const hw = parseRemoteHardware(
    "NEXLIFY_HW iface=enp45s0 gw=209.237.141.1 cpu=16 mem=64000 priv=209.237.141.15 speed=10000\nNEXLIFY_CPU_MODEL AMD"
  );
  assert.equal(hw.primaryInterface, "enp45s0");
  assert.equal(hw.gateway, "209.237.141.1");
  assert.deepEqual(hw.ipv4, ["209.237.141.15"]);
});

test("parseRemoteHardware uses unknown when iface missing", () => {
  const hw = parseRemoteHardware("NEXLIFY_HW iface= gw= cpu=2 mem=1000 priv=");
  assert.equal(hw.primaryInterface, "unknown");
});
