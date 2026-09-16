import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProbeBatchResponse } from "./probe-batch-client";

test("parseProbeBatchResponse parses JSON success", async () => {
  const res = new Response(JSON.stringify({ results: { a: { lastProbeOk: true } }, fast: false }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  const data = await parseProbeBatchResponse(res);
  assert.equal(data.results.a.lastProbeOk, true);
});

test("parseProbeBatchResponse maps HTML gateway body to a clear timeout error", async () => {
  const res = new Response("<!DOCTYPE html><html><body>504 Gateway Time-out</body></html>", {
    status: 504,
    headers: { "Content-Type": "text/html" },
  });
  await assert.rejects(() => parseProbeBatchResponse(res), /timed out|HTTP 504/i);
});

test("parseProbeBatchResponse surfaces API error JSON", async () => {
  const res = new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
  await assert.rejects(() => parseProbeBatchResponse(res), /Forbidden/);
});
