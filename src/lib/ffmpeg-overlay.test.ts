import assert from "node:assert/strict";
import test from "node:test";
import {
  applyVideoOverlayFilter,
  captureDeviceInputArgs,
  sanitizeOverlayText,
} from "./ffmpeg-overlay";

test("sanitizeOverlayText escapes drawtext-breaking chars without wiping titles", () => {
  assert.equal(sanitizeOverlayText("hi:there'bad"), "hi there bad");
  assert.ok(sanitizeOverlayText("BBC One HD").includes("BBC"));
});

test("applyVideoOverlayFilter forces encode on copy pipelines", () => {
  const out = applyVideoOverlayFilter(
    ["-i", "http://x", "-c", "copy", "-f", "mpegts"],
    { enabled: true, text: "DEMO", position: "br", fontSize: 20 },
    { streamName: "BBC", panelName: "Nexlify" }
  );
  assert.ok(out.includes("-vf"));
  assert.ok(out.some((a) => a.includes("drawtext")));
  assert.ok(out.some((a) => a.includes("font=") || a.includes("fontfile=")));
  assert.equal(out.includes("copy"), false);
  assert.ok(out.includes("libx264"));
});

test("captureDeviceInputArgs parses v4l2 and dshow; rejects option injection", () => {
  assert.deepEqual(captureDeviceInputArgs("v4l2:///dev/video0"), {
    format: "v4l2",
    device: "/dev/video0",
  });
  assert.deepEqual(captureDeviceInputArgs("dshow://video=USB Cam"), {
    format: "dshow",
    device: "video=USB Cam",
  });
  assert.equal(captureDeviceInputArgs("dshow://video=Cam:audio=Mic"), null);
  assert.equal(captureDeviceInputArgs("v4l2:///dev/sda1"), null);
  assert.equal(captureDeviceInputArgs("https://x"), null);
});
