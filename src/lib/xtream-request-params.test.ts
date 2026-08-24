import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { mergeXtreamRequestParams } from "./xtream-request-params";

test("mergeXtreamRequestParams overlays XUI POST form fields on GET", async () => {
  const req = new NextRequest("http://panel.local/player_api.php?username=query&output=ts", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "username=body&password=secret&action=get_live_streams",
  });
  const params = await mergeXtreamRequestParams(req);
  assert.equal(params.get("username"), "body");
  assert.equal(params.get("password"), "secret");
  assert.equal(params.get("action"), "get_live_streams");
  assert.equal(params.get("output"), "ts");
});

test("mergeXtreamRequestParams reads JSON body arrays like bouquet[]", async () => {
  const req = new NextRequest("http://panel.local/api.php?api_key=k", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "create_line", "bouquet[]": ["a", "b"] }),
  });
  const params = await mergeXtreamRequestParams(req);
  assert.equal(params.get("action"), "create_line");
  assert.deepEqual(params.getAll("bouquet[]"), ["a", "b"]);
});
