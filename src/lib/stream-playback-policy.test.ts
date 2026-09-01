import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VodMode } from "@prisma/client";
import {
  getStreamPlaybackPolicy,
  streamListUptimeKind,
  streamPlaysInstantThroughServers,
  streamUptimeColumnLabel,
  streamUptimeDisplayLabel,
  shouldStopIdleAgentProcess,
  type StreamForPlaybackPolicy,
} from "./stream-playback-policy";

function base(over: Partial<StreamForPlaybackPolicy> = {}): StreamForPlaybackPolicy {
  return {
    vodMode: VodMode.ON_DEMAND,
    isOnDemand: true,
    isCreatedChannel: false,
    agentStartCmd: null,
    autoRestart: true,
    streamUrl: "https://junki3monk3y.com/live/u/p/1",
    hostedExternally: false,
    ...over,
  };
}

describe("getStreamPlaybackPolicy", () => {
  it("relays imported live HTTP through the panel unless Direct source is on", () => {
    assert.equal(getStreamPlaybackPolicy(base()), "on_demand");
    assert.equal(streamPlaysInstantThroughServers(base()), false);
    assert.equal(
      getStreamPlaybackPolicy(base({ vodMode: VodMode.LIVE, isOnDemand: false, hostedExternally: true })),
      "relay"
    );
    assert.equal(
      streamPlaysInstantThroughServers(
        base({ vodMode: VodMode.LIVE, isOnDemand: false, hostedExternally: true })
      ),
      true
    );
    assert.equal(
      getStreamPlaybackPolicy(
        base({
          vodMode: VodMode.LIVE,
          isOnDemand: false,
          agentStartCmd: 'NEXLIFY_LIVE:{"directSource":true}',
        })
      ),
      "direct"
    );
  });

  it("keeps created channels on the agent path", () => {
    assert.equal(getStreamPlaybackPolicy(base({ isCreatedChannel: true })), "created");
  });

  it("keeps catch-up on the catchup path", () => {
    assert.equal(getStreamPlaybackPolicy(base({ vodMode: VodMode.CATCHUP })), "catchup");
  });

  it("transcodes when a profile is attached", () => {
    assert.equal(
      getStreamPlaybackPolicy(
        base({
          vodMode: VodMode.LIVE,
          isOnDemand: false,
          agentStartCmd: 'NEXLIFY_LIVE:{"transcodeProfile":"1080p"}',
        })
      ),
      "transcode"
    );
  });

  it("ignores leftover Redirect stream when operator chose Live only", () => {
    assert.equal(
      getStreamPlaybackPolicy(
        base({
          vodMode: VodMode.LIVE,
          isOnDemand: false,
          hostedExternally: false,
          agentStartCmd: 'NEXLIFY_LIVE:{"redirectStream":true}',
        })
      ),
      "relay"
    );
  });

  it("treats Redirect stream as provider-direct only when not Live only", () => {
    assert.equal(
      getStreamPlaybackPolicy(
        base({
          vodMode: VodMode.ON_DEMAND,
          hostedExternally: false,
          agentStartCmd: 'NEXLIFY_LIVE:{"redirectStream":true}',
        })
      ),
      "on_demand"
    );
  });

  it("stops idle agent ffmpeg when nobody is watching", () => {
    assert.equal(shouldStopIdleAgentProcess("relay", 0), true);
    assert.equal(shouldStopIdleAgentProcess("direct", 0), true);
    assert.equal(shouldStopIdleAgentProcess("transcode", 0), true);
    assert.equal(shouldStopIdleAgentProcess("relay", 2), false);
  });

  it("labels uptime as DIRECT, LIVE, or ON-DEMAND", () => {
    assert.equal(streamUptimeColumnLabel("direct"), "DIRECT");
    assert.equal(streamUptimeColumnLabel("relay"), "LIVE");
    assert.equal(streamUptimeColumnLabel("transcode"), "LIVE");
    assert.equal(streamUptimeColumnLabel("on_demand"), "ON-DEMAND");
    assert.equal(streamUptimeColumnLabel("created"), "ON-DEMAND");
    assert.equal(streamUptimeColumnLabel("catchup"), "CATCHUP");
    assert.equal(streamUptimeDisplayLabel("DIRECT"), "Direct");
    assert.equal(streamUptimeDisplayLabel("LIVE"), "Live");
    assert.equal(streamUptimeDisplayLabel("ON-DEMAND"), "On-demand");
  });

  it("shows Live on the list when vodMode is Live only, even if stats still say direct", () => {
    assert.equal(
      streamListUptimeKind({
        vodMode: "LIVE",
        isOnDemand: false,
        hostedExternally: true,
        liveStats: { playbackMode: "direct" },
      }),
      "LIVE"
    );
    assert.equal(
      streamListUptimeKind({
        vodMode: "LIVE",
        isOnDemand: false,
        hostedExternally: false,
        agentStartCmd: 'NEXLIFY_LIVE:{"redirectStream":true}',
        liveStats: { playbackMode: "direct" },
      }),
      "LIVE"
    );
    assert.equal(
      streamListUptimeKind({
        vodMode: "LIVE",
        isOnDemand: false,
        agentStartCmd: 'NEXLIFY_LIVE:{"directSource":true}',
      }),
      "DIRECT"
    );
    assert.equal(
      streamListUptimeKind({
        isOnDemand: true,
        hostedExternally: true,
        liveStats: { playbackMode: "direct" },
      }),
      "ON-DEMAND"
    );
    assert.equal(
      streamListUptimeKind({
        isOnDemand: false,
        hostedExternally: false,
        liveStats: { playbackMode: "relay" },
      }),
      "LIVE"
    );
  });
});
