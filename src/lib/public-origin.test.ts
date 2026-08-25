import assert from "node:assert/strict";
import test from "node:test";
import { pickPublicOrigin, publicOriginFromRequest } from "./public-origin";

test("pickPublicOrigin keeps an IP login even when settings use a domain", () => {
  assert.equal(
    pickPublicOrigin("http://45.88.138.18", "https://panel.example.com"),
    "http://45.88.138.18"
  );
});

test("pickPublicOrigin keeps a domain login even when settings use an IP", () => {
  assert.equal(
    pickPublicOrigin("http://panel.example.com", "http://45.88.138.18"),
    "http://panel.example.com"
  );
});

test("publicOriginFromRequest echoes the Host the IPTV client dialed", () => {
  const headers = {
    get(name: string) {
      if (name.toLowerCase() === "host") return this._host as string;
      return null;
    },
    _host: "45.88.138.18",
  };
  assert.equal(
    publicOriginFromRequest("http://127.0.0.1:13000/player_api.php", headers),
    "http://45.88.138.18"
  );
  headers._host = "panel.example.com";
  assert.equal(
    publicOriginFromRequest("http://127.0.0.1:13000/player_api.php", headers),
    "http://panel.example.com"
  );
});
