import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDnsRotator,
  pickRotatorHost,
  resolveRotatorUrl,
  validateDnsRotator,
} from "./dns-rotator";

test("parseDnsRotator normalizes pasted URLs and keeps every host", () => {
  const cfg = parseDnsRotator({
    mode: "round_robin",
    hosts: ["https://cdn1.example.com/live", "cdn2.example.com:8080", "cdn1.example.com"],
  });
  assert.deepEqual(cfg?.hosts, ["cdn1.example.com", "cdn2.example.com"]);
});

test("validateDnsRotator accepts a list of domains", () => {
  assert.equal(
    validateDnsRotator({ mode: "random", hosts: ["a.tv.example", "b.tv.example"] }),
    null
  );
});

test("round robin without a seed walks every host", () => {
  const cfg = parseDnsRotator({
    mode: "round_robin",
    hosts: ["cdn1.example.com", "cdn2.example.com", "cdn3.example.com"],
  })!;
  const seen = new Set([
    pickRotatorHost(cfg),
    pickRotatorHost(cfg),
    pickRotatorHost(cfg),
  ]);
  assert.equal(seen.size, 3);
});

test("seeded rotator is sticky per client but still uses the host list", () => {
  const cfg = parseDnsRotator({
    mode: "round_robin",
    hosts: ["cdn1.example.com", "cdn2.example.com"],
  })!;
  const a = pickRotatorHost(cfg, "line-a:stream-1");
  const b = pickRotatorHost(cfg, "line-a:stream-1");
  assert.equal(a, b);
  const url = resolveRotatorUrl("http://origin.example/live/1.ts", cfg, "line-b:stream-2");
  assert.match(url, /^http:\/\/cdn[12]\.example\.com\/live\/1\.ts$/);
  assert.ok(!url.includes("origin.example"));
});
