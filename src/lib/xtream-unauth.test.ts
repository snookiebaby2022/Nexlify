import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { xtreamUnauthPayload } from "./xtream-unauth";

const WEBOS_UA =
  "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager";

const saved = {
  mediaOrigin: process.env.NEXLIFY_MEDIA_ORIGIN,
  forceLb: process.env.NEXLIFY_MEDIA_FORCE_LB_IP,
};

describe("xtreamUnauthPayload", () => {
  beforeEach(() => {
    delete process.env.NEXLIFY_MEDIA_ORIGIN;
    delete process.env.NEXLIFY_MEDIA_FORCE_LB_IP;
  });
  afterEach(() => {
    if (saved.mediaOrigin === undefined) delete process.env.NEXLIFY_MEDIA_ORIGIN;
    else process.env.NEXLIFY_MEDIA_ORIGIN = saved.mediaOrigin;
    if (saved.forceLb === undefined) delete process.env.NEXLIFY_MEDIA_FORCE_LB_IP;
    else process.env.NEXLIFY_MEDIA_FORCE_LB_IP = saved.forceLb;
  });

  it("returns XUI-style auth 0 with server_info", () => {
    const body = xtreamUnauthPayload("http://darkcdn.store");
    assert.equal(body.user_info.auth, 0);
    assert.equal(body.server_info.url, "darkcdn.store");
    assert.equal(body.server_info.server_protocol, "http");
    assert.equal(body.server_info.port, "80");
  });

  it("forces HTTP port 80 for Smart TV even on an HTTPS origin", () => {
    const body = xtreamUnauthPayload("https://darkcdn.store", WEBOS_UA);
    assert.equal(body.user_info.auth, 0);
    assert.equal(body.server_info.server_protocol, "http");
    assert.equal(body.server_info.port, "80");
    assert.equal(body.server_info.https_port, "80");
  });

  it("advertises MEDIA_ORIGIN host and http ports when FORCE_LB media edge is configured", () => {
    process.env.NEXLIFY_MEDIA_ORIGIN = "http://209.237.141.15";
    process.env.NEXLIFY_MEDIA_FORCE_LB_IP = "1";
    const body = xtreamUnauthPayload("http://darkcdn.store", "Mozilla/5.0 Chrome/120");
    assert.equal(body.server_info.url, "209.237.141.15");
    assert.equal(body.server_info.port, "80");
    assert.equal(body.server_info.https_port, "80");
    assert.equal(body.server_info.server_protocol, "http");
  });
});
