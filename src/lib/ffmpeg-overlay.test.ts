import assert from "node:assert/strict";
import test from "node:test";
import {
  applyVideoOverlayFilter,
  captureDeviceInputArgs,
  sanitizeOverlayText,
} from "./ffmpeg-overlay";

test("sanitizeOverlayText strips quotes and colons", () => {
  assert.equal(sanitizeOverlayText("hi:there'bad"), "hitherebad");
});

test("applyVideoOverlayFilter forces encode on copy pipelines", () => {
  const out = applyVideoOverlayFilter(
    ["-i", "http://x", "-c", "copy", "-f", "mpegts"],
    { enabled: true, text: "DEMO", position: "br", fontSize: 20 },
    { streamName: "BBC", panelName: "Nexlify" }
  );
  assert.ok(out.includes("-vf"));
  assert.ok(out.some((a) => a.includes("drawtext")));
  assert.equal(out.includes("copy"), false);
  assert.ok(out.includes("libx264"));
});

test("captureDeviceInputArgs parses v4l2 and dshow", () => {
  assert.deepEqual(captureDeviceInputArgs("v4l2:///dev/video0"), {
    format: "v4l2",
    device: "/dev/video0",
  });
  assert.deepEqual(captureDeviceInputArgs("dshow://video=USB Cam"), {
    format: "dshow",
    device: "video=USB Cam",
  });
  assert.equal(captureDeviceInputArgs("https://x"), null);
});
