import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stalkerCreateLinkStreamId } from "./stalker";

describe("stalkerCreateLinkStreamId", () => {
  it("parses Ministra ffmpeg stream ids", () => {
    assert.equal(stalkerCreateLinkStreamId("ffmpeg 12345"), "12345");
    assert.equal(stalkerCreateLinkStreamId("series:abc"), "abc");
  });

  it("parses a previous create_link MPEG-TS URL", () => {
    assert.equal(
      stalkerCreateLinkStreamId("ffmpeg http://darkcdn.store/live/demo/pass/live123.ts"),
      "live123"
    );
  });
});
