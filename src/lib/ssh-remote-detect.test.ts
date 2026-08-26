import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRemoteHardware } from "@/lib/ssh-remote-detect";

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
