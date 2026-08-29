import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { VodMode } from "@prisma/client";
import {
  getStreamPlaybackMode,
  streamUsesDirectRelay,
  type StreamForPlaybackMode,
} from "./stream-playback-mode";

const defaults = {
  vodMode: "ON_DEMAND",
  isOnDemand: true,
  isCreatedChannel: false,
  agentStartCmd: null,
  autoRestart: true,
  streamUrl: "https://junki3monk3y.com/live/u/p/1",
  hostedExternally: false,
} satisfies StreamForPlaybackMode;

function base(over: Partial<StreamForPlaybackMode> = {}): StreamForPlaybackMode {
  return { ...defaults, ...over };
}

describe("getStreamPlaybackMode", () => {
  it("splices imported XUI restreams as direct even with autoRestart + ON_DEMAND", () => {
    assert.equal(getStreamPlaybackMode(base()), "direct");
    assert.equal(streamUsesDirectRelay(base({ hostedExternally: true })), true);
  });

  it("keeps created channels on the agent path", () => {
    assert.equal(getStreamPlaybackMode(base({ isCreatedChannel: true })), "created");
  });

  it("keeps catch-up on the catchup path", () => {
    assert.equal(getStreamPlaybackMode(base({ vodMode: "CATCHUP" as VodMode })), "catchup");
  });

  it("transcodes when a profile is attached", () => {
    assert.equal(
      getStreamPlaybackMode(
        base({
          vodMode: "LIVE" as VodMode,
          isOnDemand: false,
          agentStartCmd: 'NEXLIFY_LIVE:{"transcodeProfile":"1080p"}',
        })
      ),
      "transcode"
    );
  });
});
