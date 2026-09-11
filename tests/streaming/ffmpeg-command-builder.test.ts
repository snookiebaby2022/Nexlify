import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFfmpegArgv,
  sanitizeFfmpegInputUrl,
} from "../../src/lib/ffmpeg-agent";
import {
  FFMPEG_TRANSCODE_PROFILES,
  buildFfmpegTranscodeArgs,
  getFfmpegProfile,
} from "../../src/lib/ffmpeg-transcode-profiles";

/** Exact argv snapshots per profile (no ffmpeg spawn). */
const EXPECTED_TRANSCODE_ARGV: Record<string, string[]> = {
  copy: ["-i", "INPUT", "-c", "copy", "-f", "mpegts"],
  "1080p-hq": [
    "-i",
    "INPUT",
    "-c:v",
    "libx264",
    "-b:v",
    "8000k",
    "-maxrate",
    "8800k",
    "-bufsize",
    "16000k",
    "-vf",
    "scale=1920:1080",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-preset",
    "veryfast",
    "-f",
    "mpegts",
  ],
  "1080p50": [
    "-i",
    "INPUT",
    "-c:v",
    "libx264",
    "-b:v",
    "10000k",
    "-maxrate",
    "11000k",
    "-bufsize",
    "20000k",
    "-vf",
    "scale=1920:1080",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-preset",
    "veryfast",
    "-f",
    "mpegts",
  ],
  "720p": [
    "-i",
    "INPUT",
    "-c:v",
    "libx264",
    "-b:v",
    "4000k",
    "-maxrate",
    "4400k",
    "-bufsize",
    "8000k",
    "-vf",
    "scale=1280:720",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-preset",
    "veryfast",
    "-f",
    "mpegts",
  ],
  "576p": [
    "-i",
    "INPUT",
    "-c:v",
    "libx264",
    "-b:v",
    "2500k",
    "-maxrate",
    "2750k",
    "-bufsize",
    "5000k",
    "-vf",
    "scale=1024:576",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-preset",
    "veryfast",
    "-f",
    "mpegts",
  ],
  "480p": [
    "-i",
    "INPUT",
    "-c:v",
    "libx264",
    "-b:v",
    "2000k",
    "-maxrate",
    "2200k",
    "-bufsize",
    "4000k",
    "-vf",
    "scale=854:480",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-preset",
    "veryfast",
    "-f",
    "mpegts",
  ],
  "360p-mobile": [
    "-i",
    "INPUT",
    "-c:v",
    "libx264",
    "-b:v",
    "1000k",
    "-maxrate",
    "1100k",
    "-bufsize",
    "2000k",
    "-vf",
    "scale=640:360",
    "-c:a",
    "aac",
    "-b:a",
    "64k",
    "-preset",
    "ultrafast",
    "-f",
    "mpegts",
  ],
};

describe("FFmpeg command builder — transcode profiles", () => {
  it("covers every published profile with an exact argv snapshot", () => {
    assert.equal(FFMPEG_TRANSCODE_PROFILES.length, Object.keys(EXPECTED_TRANSCODE_ARGV).length);
    for (const profile of FFMPEG_TRANSCODE_PROFILES) {
      const expected = EXPECTED_TRANSCODE_ARGV[profile.id];
      assert.ok(expected, `missing snapshot for profile ${profile.id}`);
      const argv = buildFfmpegTranscodeArgs(profile, "INPUT");
      assert.deepEqual(argv, expected, profile.id);
      assert.equal(getFfmpegProfile(profile.id)?.id, profile.id);
    }
  });
});

describe("FFmpeg command builder — injection hardening", () => {
  it("keeps shell metacharacters inside a single argv slot (no shell)", () => {
    const evil =
      "http://cdn.example/live.ts; rm -rf / | curl evil.test `id` $(reboot) &";
    const spec = buildFfmpegArgv({
      ffmpegPath: "/usr/bin/ffmpeg",
      inputUrl: evil,
      streamId: "s1",
      serverId: "srv1",
    });
    const iIdx = spec.args.indexOf("-i");
    assert.ok(iIdx >= 0);
    assert.equal(spec.args[iIdx + 1], evil);
    assert.equal(spec.args.filter((a) => a === "-i").length, 1);
    // Metacharacters must not become separate argv flags.
    for (const token of [";", "|", "`", "$(", "&"]) {
      assert.equal(spec.args.includes(token), false);
    }
  });

  it("rejects control characters that could break argv / logs", () => {
    assert.throws(() => sanitizeFfmpegInputUrl("http://x/\0y"), /Invalid stream source/);
    assert.throws(() => sanitizeFfmpegInputUrl("http://x/\ny"), /Invalid stream source/);
    assert.throws(
      () =>
        buildFfmpegArgv({
          ffmpegPath: "/usr/bin/ffmpeg",
          inputUrl: "http://x/\u0007inject",
          streamId: "s1",
          serverId: "srv1",
        }),
      /Invalid stream source/
    );
  });

  it("ignores preset strings that look like flag injection", () => {
    const spec = buildFfmpegArgv({
      ffmpegPath: "/usr/bin/ffmpeg",
      inputUrl: "http://cdn.example/a.ts",
      streamId: "s1",
      serverId: "srv1",
      preset: "veryfast; -f lavfi -i nullsrc",
    });
    assert.equal(spec.args.includes("-preset"), false);
    assert.equal(spec.args.includes("nullsrc"), false);
  });

  it("does not promote user URL fragments into extra -flags / -f values", () => {
    const url = "http://cdn.example/live.ts -f lavfi -i anullsrc -c copy";
    const spec = buildFfmpegArgv({
      ffmpegPath: "/usr/bin/ffmpeg",
      inputUrl: url,
      streamId: "s1",
      serverId: "srv1",
    });
    const iIdx = spec.args.indexOf("-i");
    assert.equal(spec.args[iIdx + 1], url);
    // Only one intentional input; trailing copy of injected "-i" must not appear as a flag.
    const dashICount = spec.args.filter((a) => a === "-i").length;
    assert.equal(dashICount, 1);
  });

  it("composes agent argv with profile transcode body without shell", () => {
    const profile = getFfmpegProfile("720p")!;
    const body = buildFfmpegTranscodeArgs(profile, "http://x/live");
    const spec = buildFfmpegArgv({
      ffmpegPath: "/usr/bin/ffmpeg",
      inputUrl: "http://x/live",
      streamId: "s1",
      serverId: "srv1",
      transcodeArgs: body,
    });
    assert.ok(spec.args.includes("scale=1280:720"));
    assert.ok(spec.args.includes("4000k"));
    assert.equal(spec.args[spec.args.length - 3] === "pipe:1" || spec.args.includes("pipe:1"), true);
  });
});
