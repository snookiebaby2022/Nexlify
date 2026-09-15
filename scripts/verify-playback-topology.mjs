#!/usr/bin/env node
import { getPlaybackTopologyReport } from "../src/lib/playback-topology-probe.ts";

const report = await getPlaybackTopologyReport({ probeEdgeHealth: true });
for (const c of report.checks) {
  const mark = c.ok ? "OK" : c.severity === "critical" ? "FAIL" : "WARN";
  console.log(`${mark} ${c.id}: ${c.hint}`);
}
if (!report.ok) {
  console.error("playback topology checks failed");
  process.exit(1);
}
console.log("playback topology OK");
