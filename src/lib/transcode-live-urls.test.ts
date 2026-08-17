import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTranscodeVariantLiveRows,
  matchTranscodingProfile,
  packagerDiskStreamId,
  parseLivePlaybackStreamKey,
  streamHasExplicitTranscodeProfile,
  transcodeProfileSlug,
  transcodeVariantNumericId,
} from "./transcode-live-urls";
import { packagerFfmpegInputPrefix } from "./ts-hls-packager";
import { zapNeighborIds } from "./anti-freeze";
import { encodeLiveStreamMeta } from "./stream-live-meta";

test("parseLivePlaybackStreamKey splits XUI profile suffix", () => {
  assert.deepEqual(parseLivePlaybackStreamKey("1862838169_720p.ts"), {
    token: "1862838169",
    profileHint: "720p",
  });
  assert.deepEqual(parseLivePlaybackStreamKey("1862838169.m3u8"), {
    token: "1862838169",
    profileHint: null,
  });
});

test("transcode variant numeric ids are stable and distinct", () => {
  const a = transcodeVariantNumericId("streamcuid", "transcode_1");
  const b = transcodeVariantNumericId("streamcuid", "transcode_2");
  assert.equal(a, transcodeVariantNumericId("streamcuid", "transcode_1"));
  assert.notEqual(a, b);
});

test("buildTranscodeVariantLiveRows only expands explicit transcode streams", () => {
  const profiles = [
    {
      id: "transcode_hd",
      name: "720p",
      resolution: "1280x720",
      bitrate: 2500,
      codec: "h264",
      gpuAcceleration: false,
      isActive: true,
    },
  ];
  const transcoded = {
    id: "s1",
    agentStartCmd: encodeLiveStreamMeta({ transcodeProfile: "hd" }),
  };
  const direct = { id: "s2", agentStartCmd: encodeLiveStreamMeta({ transcodeProfile: "none" }) };
  assert.equal(streamHasExplicitTranscodeProfile(transcoded.agentStartCmd), true);
  assert.equal(streamHasExplicitTranscodeProfile(direct.agentStartCmd), false);

  const base = [
    { num: 1, name: "BBC", stream_type: "live", stream_id: 11, custom_sid: "" },
    { num: 2, name: "ITV", stream_type: "live", stream_id: 22, custom_sid: "" },
  ];
  const rows = buildTranscodeVariantLiveRows([transcoded, direct], base, profiles);
  assert.equal(rows.length, 3);
  assert.equal(rows[2]!.name, "BBC [720p]");
  assert.equal(rows[2]!.stream_id, transcodeVariantNumericId("s1", "transcode_hd"));
  assert.equal(matchTranscodingProfile("720p", profiles)?.id, "transcode_hd");
  assert.equal(packagerDiskStreamId("s1", profiles[0]), `s1__${transcodeProfileSlug(profiles[0]!)}`);
});

test("packager does not use -re for live or VOD HTTP (only looping files)", () => {
  assert.deepEqual(packagerFfmpegInputPrefix({ vod: true }), []);
  assert.deepEqual(packagerFfmpegInputPrefix({}), []);
  assert.deepEqual(packagerFfmpegInputPrefix({ loop: true }), ["-re", "-stream_loop", "-1"]);
});

test("zapNeighborIds stays bounded", () => {
  const ids = ["a", "b", "c", "d", "e"];
  assert.deepEqual(zapNeighborIds(ids, "c", 1).sort(), ["b", "d"]);
  assert.deepEqual(zapNeighborIds(ids, "a", 2), ["b", "c"]);
});
