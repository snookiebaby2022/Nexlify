import assert from "node:assert/strict";
import test from "node:test";
import { formatFfprobeSummary, parseFfprobeJson } from "./ffprobe-media";

test("parseFfprobeJson reads live MPEG-TS video and audio", () => {
  const info = parseFfprobeJson(
    JSON.stringify({
      format: { format_name: "mpegts", bit_rate: "4500000" },
      streams: [
        {
          codec_type: "video",
          codec_name: "h264",
          width: 1920,
          height: 1080,
          avg_frame_rate: "25/1",
        },
        { codec_type: "audio", codec_name: "aac" },
      ],
    })
  );
  assert.equal(info?.videoCodec, "h264");
  assert.equal(info?.audioCodec, "aac");
  assert.equal(info?.resolution, "1920x1080");
  assert.equal(info?.fps, 25);
  assert.equal(info?.bitrateKbps, 4500);
  assert.equal(info?.format, "mpegts");
  assert.match(formatFfprobeSummary(info!), /h264 1920x1080 25fps aac 4500kbps/);
});

test("parseFfprobeJson ignores attached jpeg covers", () => {
  const info = parseFfprobeJson(
    JSON.stringify({
      format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "120.5" },
      streams: [
        { codec_type: "video", codec_name: "mjpeg", width: 300, height: 300 },
        { codec_type: "video", codec_name: "hevc", width: 1280, height: 720, r_frame_rate: "30/1" },
        { codec_type: "audio", codec_name: "ac3" },
      ],
    })
  );
  assert.equal(info?.videoCodec, "hevc");
  assert.equal(info?.resolution, "1280x720");
  assert.equal(info?.audioCodec, "ac3");
  assert.equal(info?.durationSec, 120.5);
});
