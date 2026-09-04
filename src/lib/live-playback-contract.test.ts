import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { playbackFailKind } from "./live-playback-contract";

describe("playbackFailKind", () => {
  it("treats gateway statuses as splice", () => {
    assert.equal(playbackFailKind("nope", 502), "splice");
    assert.equal(playbackFailKind("timeout", 504), "splice");
  });

  it("treats Viewer 502 text as splice", () => {
    assert.equal(playbackFailKind("Viewer: upstream 502 and no backup left"), "splice");
  });

  it("keeps app/UA failures as viewer", () => {
    assert.equal(playbackFailKind("Unauthorized"), "viewer");
    assert.equal(playbackFailKind("No playable upstream URL for viewer"), "viewer");
  });
});
