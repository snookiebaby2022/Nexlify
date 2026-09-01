import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { xtreamUnauthPayload } from "./xtream-unauth";

const WEBOS_UA =
  "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager";

describe("xtreamUnauthPayload", () => {
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
});
