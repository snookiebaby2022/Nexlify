#!/usr/bin/env npx tsx
/** Smoke test feature packs + core libs. Run: npx tsx scripts/feature-packs-smoke-test.ts */
import { FEATURE_PACKS, FULL_BUNDLE_SERVICE_IDS } from "../src/lib/feature-packs";
import { GPU_TRANSCODE_LADDER, pickAdaptiveProfile } from "../src/lib/gpu-transcode";
import { WEBHOOK_EVENTS } from "../src/lib/webhook-events";

let pass = 0;
let fail = 0;

function ok(name: string) {
  pass += 1;
  console.log(`  OK ${name}`);
}

function bad(name: string, detail: string) {
  fail += 1;
  console.error(`  FAIL ${name}: ${detail}`);
}

console.log("=== Feature packs smoke test ===\n");

if (FEATURE_PACKS.length >= 6) ok("feature pack catalog");
else bad("feature pack catalog", `expected 6+ packs, got ${FEATURE_PACKS.length}`);

if (FULL_BUNDLE_SERVICE_IDS.length >= 5) ok("full bundle includes packs");
else bad("full bundle", "missing service ids");

if (GPU_TRANSCODE_LADDER.some((p) => p.gpuEncoder === "nvenc")) ok("GPU NVENC ladder");
else bad("GPU ladder", "no nvenc profile");

const adaptive = pickAdaptiveProfile(GPU_TRANSCODE_LADDER, { maxBandwidthKbps: 3000 });
if (adaptive.videoBitrateKbps <= 3000) ok("adaptive profile pick");
else bad("adaptive", `bitrate too high: ${adaptive.videoBitrateKbps}`);

if (WEBHOOK_EVENTS.includes("line.created")) ok("webhook events catalog");
else bad("webhooks", "missing line.created");

import fs from "fs";
const paths = [
  "src/lib/intelligent-lb.ts",
  "src/lib/ip-reputation.ts",
  "src/lib/archive-recorder.ts",
  "src/lib/analytics-insights.ts",
  "src/app/admin/marketplace/page.tsx",
  "src/app/api/webrtc/whep/route.ts",
  "public/manifest.json",
];
for (const p of paths) {
  if (fs.existsSync(p)) ok(`exists ${p}`);
  else bad("exists", p);
}

console.log(`\n=== Done: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
