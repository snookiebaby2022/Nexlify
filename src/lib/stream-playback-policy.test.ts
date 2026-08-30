import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VodMode } from "@prisma/client";
import {
  getStreamPlaybackPolicy,
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
  it("relays imported live HTTP through the panel unless hosted by provider", () => {
    assert.equal(getStreamPlaybackPolicy(base()), "relay");
    assert.equal(streamPlaysInstantThroughServers(base()), true);
    assert.equal(getStreamPlaybackPolicy(base({ hostedExternally: true })), "direct");
    assert.equal(streamPlaysInstantThroughServers(base({ hostedExternally: true })), true);
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

  it("treats Redirect stream as provider-direct", () => {
    assert.equal(
      getStreamPlaybackPolicy(
        base({
          hostedExternally: false,
          agentStartCmd: 'NEXLIFY_LIVE:{"redirectStream":true}',
        })
      ),
      "direct"
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
});
