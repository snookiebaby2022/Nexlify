import assert from "node:assert/strict";
import test from "node:test";
import { parseM3u } from "./m3u-parser";
import { liveStreamDisplayName } from "./import-live-m3u";

test("parseM3u prefers tvg-name over comma title", () => {
  const entries = parseM3u(`#EXTM3U
#EXTINF:-1 tvg-id="bbc1.uk" tvg-name="BBC One HD" tvg-logo="https://cdn.example/bbc.png" group-title="UK",BBC 1
http://provider.example/live/1.ts
`);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, "BBC One HD");
  assert.equal(entries[0].tvgName, "BBC One HD");
  assert.equal(entries[0].logo, "https://cdn.example/bbc.png");
  assert.equal(entries[0].group, "UK");
  assert.equal(entries[0].tvgId, "bbc1.uk");
});

test("parseM3u falls back to comma title when tvg-name missing", () => {
  const entries = parseM3u(`#EXTM3U
#EXTINF:-1 group-title="Sports",Sky Sports Main Event
http://provider.example/live/2.ts
`);
  assert.equal(entries[0].name, "Sky Sports Main Event");
  assert.equal(entries[0].group, "Sports");
});

test("liveStreamDisplayName prefers tvgName", () => {
  assert.equal(
    liveStreamDisplayName({
      name: "Raw Title",
      url: "http://x",
      tvgName: "Clean Name",
    }),
    "Clean Name"
  );
});
