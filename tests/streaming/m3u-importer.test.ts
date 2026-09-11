import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guessStreamType, parseM3u } from "../../src/lib/m3u-parser";

describe("M3U importer — valid playlist", () => {
  it("parses EXTINF attrs and URL lines", () => {
    const entries = parseM3u(`#EXTM3U
#EXTINF:-1 tvg-id="bbc1.uk" tvg-name="BBC One HD" tvg-logo="https://cdn.example/bbc.png" group-title="UK",BBC 1
http://provider.example/live/1.ts
#EXTINF:-1 group-title="Sports",Sky Sports
http://provider.example/live/2.ts
`);
    assert.equal(entries.length, 2);
    assert.equal(entries[0]!.name, "BBC One HD");
    assert.equal(entries[0]!.tvgId, "bbc1.uk");
    assert.equal(entries[0]!.group, "UK");
    assert.equal(entries[1]!.name, "Sky Sports");
    assert.equal(guessStreamType(entries[0]!), "LIVE");
  });

  it("keeps pending through option lines between EXTINF and URL", () => {
    const entries = parseM3u(`#EXTM3U
#EXTINF:-1,Channel
#EXTVLCOPT:http-user-agent=VLC
http://provider.example/live/3.ts
`);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.url, "http://provider.example/live/3.ts");
  });
});

describe("M3U importer — malformed", () => {
  it("ignores EXTINF without a following URL and bare garbage lines", () => {
    const entries = parseM3u(`#EXTM3U
#EXTINF:-1,Orphan
not a url
#EXTINF:-1,Good
http://ok.example/1.ts
random text
`);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.name, "Good");
  });

  it("returns empty for empty / header-only playlists", () => {
    assert.deepEqual(parseM3u(""), []);
    assert.deepEqual(parseM3u("#EXTM3U\n"), []);
  });
});

describe("M3U importer — duplicates", () => {
  it("keeps duplicate names/URLs as separate entries (importer dedupes later)", () => {
    const entries = parseM3u(`#EXTM3U
#EXTINF:-1 tvg-id="dup.uk",Dup A
http://provider.example/live/1.ts
#EXTINF:-1 tvg-id="dup.uk",Dup A
http://provider.example/live/1.ts
#EXTINF:-1,Dup B
http://provider.example/live/1.ts
`);
    assert.equal(entries.length, 3);
    assert.equal(entries.filter((e) => e.url.endsWith("/1.ts")).length, 3);
  });
});

describe("M3U importer — 10k-entry playlists", () => {
  it("parses ten thousand entries deterministically", () => {
    const lines = ["#EXTM3U"];
    for (let i = 0; i < 10_000; i++) {
      lines.push(`#EXTINF:-1 tvg-id="ch${i}" group-title="G${i % 10}",Channel ${i}`);
      lines.push(`http://cdn.example/live/${i}.ts`);
    }
    const content = lines.join("\n");
    const entries = parseM3u(content);
    assert.equal(entries.length, 10_000);
    assert.equal(entries[0]!.name, "Channel 0");
    assert.equal(entries[0]!.url, "http://cdn.example/live/0.ts");
    assert.equal(entries[9999]!.name, "Channel 9999");
    assert.equal(entries[9999]!.tvgId, "ch9999");
    assert.equal(guessStreamType(entries[5000]!), "LIVE");
  });
});
