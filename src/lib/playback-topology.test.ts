import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePlaybackTopology, panelMustNotRunLocalIptvEdge } from "./playback-topology";
import { liveTitleExactKey, liveTitleQualityKey } from "./live-title-dedupe";
import { xtreamOutputFormats } from "./xtream-safe";

describe("playback topology", () => {
  it("maps A/B/C/D aliases", () => {
    assert.equal(parsePlaybackTopology("A"), "local-edge");
    assert.equal(parsePlaybackTopology("remote"), "remote-splice");
    assert.equal(parsePlaybackTopology("multi-lb"), "multi-lb");
    assert.equal(parsePlaybackTopology("classic-lb"), "classic-lb");
    assert.equal(parsePlaybackTopology("D"), "classic-lb");
    assert.equal(parsePlaybackTopology("ffmpeg-lb"), "classic-lb");
  });

  it("skips local edge on B, C, and classic-lb", () => {
    assert.equal(panelMustNotRunLocalIptvEdge("local-edge"), false);
    assert.equal(panelMustNotRunLocalIptvEdge("remote-splice"), true);
    assert.equal(panelMustNotRunLocalIptvEdge("multi-lb"), true);
    assert.equal(panelMustNotRunLocalIptvEdge("classic-lb"), true);
  });
});

describe("live title dedupe", () => {
  it("collapses quality tokens for warnings", () => {
    assert.equal(liveTitleQualityKey("Sky Sports Main Event FHD"), liveTitleQualityKey("Sky Sports Main Event HD"));
  });

  it("keeps exact titles distinct", () => {
    assert.notEqual(liveTitleExactKey("Sky Sports Main Event FHD"), liveTitleExactKey("Sky Sports Main Event HD"));
  });
});

describe("xtream live formats", () => {
  it("defaults to mpegts first", () => {
    assert.deepEqual(xtreamOutputFormats(""), ["ts", "m3u8"]);
  });
});
