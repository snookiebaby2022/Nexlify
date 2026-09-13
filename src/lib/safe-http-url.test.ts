import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeHttpUrl } from "./safe-http-url";

test("sanitizeHttpUrl — allows https and same-origin paths", () => {
  assert.equal(sanitizeHttpUrl("https://t.me/nexlify"), "https://t.me/nexlify");
  assert.equal(sanitizeHttpUrl("/brand/logo.png"), "/brand/logo.png");
});

test("sanitizeHttpUrl — rejects javascript and data", () => {
  assert.equal(sanitizeHttpUrl("javascript:alert(1)"), null);
  assert.equal(sanitizeHttpUrl("data:text/html,hi"), null);
  assert.equal(sanitizeHttpUrl("//evil.example/x"), null);
});

test("sanitizeHttpUrl — rejects userinfo", () => {
  assert.equal(sanitizeHttpUrl("https://user:pass@example.com/"), null);
});
