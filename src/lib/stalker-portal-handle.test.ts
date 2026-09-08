import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { isStalkerPortalRequest } from "./stalker-portal-handle";
import { isStbPortalDocumentRequest } from "./stb-client";

function req(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(url, "https://darkcdn.store"), init);
}

test("GET /c/ with MAG cookie is the HTML portal, not the Stalker API", () => {
  const r = req("https://darkcdn.store/c/", {
    headers: {
      cookie: "mac=00:1A:79:32:62:39",
      "user-agent": "Mozilla/5.0 MAG254 stbapp STBEmu",
    },
  });
  assert.equal(isStalkerPortalRequest(r), false);
});

test("GET handshake query is the Stalker API", () => {
  const r = req("https://darkcdn.store/c/?type=stb&action=handshake&JsHttpRequest=1-xml", {
    headers: { cookie: "mac=00:1A:79:32:62:39" },
  });
  assert.equal(isStalkerPortalRequest(r), true);
});

test("POST /c/ is the Stalker API", () => {
  const r = req("https://darkcdn.store/c/", { method: "POST" });
  assert.equal(isStalkerPortalRequest(r), true);
});

test("StbEmu UA is a portal document client", () => {
  const r = req("https://darkcdn.store/", {
    headers: { "user-agent": "Mozilla/5.0 MAG254 stbapp STBEmu" },
  });
  assert.equal(isStbPortalDocumentRequest(r), true);
});

test("desktop browser is not a MAG portal document client", () => {
  const r = req("https://darkcdn.store/", {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:154.0) Gecko/20100101 Firefox/154.0",
    },
  });
  assert.equal(isStbPortalDocumentRequest(r), false);
});
