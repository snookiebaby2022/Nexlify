import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFfmpegArgv, buildFfmpegStartCmd } from "./ffmpeg-agent";

test("buildFfmpegArgv uses argv not shell and rejects relative binaries", () => {
  const spec = buildFfmpegArgv({
    ffmpegPath: "/usr/bin/ffmpeg",
    inputUrl: "http://example.com/live'; rm -rf /",
    streamId: "s1",
    serverId: "srv1",
  });
  assert.equal(spec.ffmpegPath, "/usr/bin/ffmpeg");
  assert.ok(spec.args.includes("http://example.com/live'; rm -rf /"));
  assert.equal(spec.pidFile, "/var/run/nexlify/stream-srv1-s1.pid");
  const relative = buildFfmpegArgv({
    ffmpegPath: "ffmpeg",
    inputUrl: "http://x",
    streamId: "s1",
    serverId: "srv1",
  });
  assert.equal(relative.ffmpegPath, "/usr/bin/ffmpeg");
});

test("legacy startCmd quotes the URL", () => {
  const spec = buildFfmpegArgv({
    ffmpegPath: "/usr/bin/ffmpeg",
    inputUrl: "http://x/a'b",
    streamId: "s1",
    serverId: "srv1",
  });
  const cmd = buildFfmpegStartCmd(spec);
  assert.equal(cmd.includes("eval"), false);
  assert.ok(cmd.includes(`'http://x/a'\\''b'`));
});
