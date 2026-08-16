import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_ALLOWED_OUTPUT,
  defaultAccessOutputSelection,
  normalizeAllowedOutputInput,
  parseAccessOutput,
  serializeAccessOutput,
} from "./line-access-output";

describe("line-access-output", () => {
  it("defaults to all formats checked", () => {
    const selected = defaultAccessOutputSelection();
    assert.equal(selected.size, 3);
    assert.equal(serializeAccessOutput(selected), DEFAULT_ALLOWED_OUTPUT);
  });

  it("parses legacy ts,hls,m3u8 without rtmp", () => {
    const selected = parseAccessOutput("ts,hls,m3u8");
    assert.ok(selected.has("hls"));
    assert.ok(selected.has("mpegts"));
    assert.equal(selected.has("rtmp"), false);
  });

  it("round-trips XUI-style selection", () => {
    const raw = serializeAccessOutput(new Set(["hls", "mpegts", "rtmp"] as const));
    assert.match(raw, /hls/);
    assert.match(raw, /ts/);
    assert.match(raw, /rtmp/);
    const again = parseAccessOutput(raw);
    assert.equal(again.size, 3);
  });

  it("normalizes empty input to default", () => {
    assert.equal(normalizeAllowedOutputInput(""), DEFAULT_ALLOWED_OUTPUT);
    assert.equal(normalizeAllowedOutputInput("hls,ts,rtmp"), "hls,m3u8,ts,rtmp");
  });
});
