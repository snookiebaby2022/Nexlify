import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Readable } from "node:stream";
import {
  isPlayableUpstreamContentType,
  looksLikePlayableMediaPayload,
  looksLikeHtmlErrorPayload,
  liveMpegTsResponseHeaders,
  upstreamToWebResponse,
} from "./live-upstream-proxy";
import { packagerLiveInputPrefix } from "./ts-hls-packager";
import { hlsMediaSegmentHttp } from "./hls-playback";
import { getPrimaryBitrate, type BitrateVariant } from "./stream-variants";

describe("isPlayableUpstreamContentType", () => {
  it("accepts mpegts and video types", () => {
    assert.equal(isPlayableUpstreamContentType("video/mp2t"), true);
    assert.equal(isPlayableUpstreamContentType("application/octet-stream"), true);
    assert.equal(isPlayableUpstreamContentType(null), true);
  });
  it("rejects html and json error pages by header", () => {
    assert.equal(isPlayableUpstreamContentType("text/html; charset=UTF-8"), false);
    assert.equal(isPlayableUpstreamContentType("application/json"), false);
  });
});

describe("looksLikePlayableMediaPayload", () => {
  it("detects MPEG-TS sync bytes", () => {
    const pkt = Buffer.alloc(188, 0);
    pkt[0] = 0x47;
    const buf = Buffer.concat([pkt, pkt]);
    assert.equal(looksLikePlayableMediaPayload(buf), true);
  });
  it("rejects HTML bodies", () => {
    assert.equal(looksLikePlayableMediaPayload(Buffer.from("<!DOCTYPE html><html>")), false);
    assert.equal(looksLikeHtmlErrorPayload(Buffer.from("<html><body>deny</body></html>")), true);
  });
});

describe("live MPEG-TS headers for VLC", () => {
  it("never advertises byte ranges or Content-Length", () => {
    const headers = liveMpegTsResponseHeaders("video/mp2t", {
      "Content-Length": "12345",
      "Accept-Ranges": "bytes",
      "Content-Range": "bytes 0-1/2",
      ETag: "abc",
    });
    assert.equal(headers["Content-Type"], "video/mp2t");
    assert.equal(headers["Accept-Ranges"], "none");
    assert.equal(headers["Content-Length"], undefined);
    assert.equal(headers["Content-Range"], undefined);
    assert.equal(headers.ETag, undefined);
  });

  it("strips range headers for live unbounded MPEG-TS", () => {
    const { stream, headers } = upstreamToWebResponse(
      {
        status: 200,
        contentType: "video/mp2t",
        body: Readable.from([Buffer.from([0x47, 0x00])]),
        finalUrl: "http://cdn.example/live.ts",
        headers: { "content-length": "999", "accept-ranges": "bytes" },
      },
      undefined,
      { liveUnbounded: true }
    );
    void stream.cancel();
    assert.equal(headers["Accept-Ranges"], "none");
    assert.equal(headers["Content-Length"], undefined);
    assert.equal(headers["Content-Type"], "video/mp2t");
  });

  it("keeps Accept-Ranges for VOD/movie seeking", () => {
    const { stream, headers } = upstreamToWebResponse(
      {
        status: 206,
        contentType: "video/mp4",
        body: Readable.from([Buffer.from([0x00])]),
        finalUrl: "http://cdn.example/movie.mp4",
        headers: { "content-length": "1000", "accept-ranges": "bytes", "content-range": "bytes 0-999/1000" },
      },
      { "Accept-Ranges": "bytes" }
    );
    void stream.cancel();
    assert.equal(headers["Accept-Ranges"] ?? headers["accept-ranges"], "bytes");
    assert.equal(headers["content-length"], "1000");
    assert.equal(headers["content-range"], "bytes 0-999/1000");
  });
});

describe("HLS packager live input", () => {
  it("does not use -re for live HTTP (on-demand TS)", () => {
    assert.deepEqual(packagerLiveInputPrefix(), []);
    assert.equal(packagerLiveInputPrefix().includes("-re"), false);
  });
  it("keeps -re for looped created channels and VOD files", () => {
    assert.deepEqual(packagerLiveInputPrefix({ loop: true }), ["-re", "-stream_loop", "-1"]);
    assert.deepEqual(packagerLiveInputPrefix({ vod: true }), ["-re"]);
  });
});

describe("hlsMediaSegmentHttp", () => {
  it("returns 200 with video/mp2t and no byte-range 206", () => {
    const seg = hlsMediaSegmentHttp(1880);
    assert.equal(seg.status, 200);
    assert.equal(seg.headers["Content-Type"], "video/mp2t");
    assert.equal(seg.headers["Content-Length"], "1880");
    assert.equal(seg.headers["Accept-Ranges"], "none");
  });
});

describe("getPrimaryBitrate", () => {
  it("does not fall back to variants[0] without isPrimary", () => {
    const variants: BitrateVariant[] = [
      { id: "a", label: "low", path: "http://example/low" },
      { id: "b", label: "hi", path: "http://example/hi", isPrimary: true },
    ];
    assert.equal(getPrimaryBitrate(variants)?.id, "b");
    assert.equal(getPrimaryBitrate([{ id: "a", label: "low", path: "/x" }]), null);
  });
});
