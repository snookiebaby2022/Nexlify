import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { mutationOriginAllowed } from "./admin-route-guard";

test("mutationOriginAllowed allows same-host Origin on POST", () => {
  const req = new NextRequest("https://panel.example/api/x", {
    method: "POST",
    headers: { host: "panel.example", origin: "https://panel.example" },
  });
  assert.equal(mutationOriginAllowed(req), true);
});

test("mutationOriginAllowed rejects foreign Origin on POST", () => {
  const req = new NextRequest("https://panel.example/api/x", {
    method: "POST",
    headers: { host: "panel.example", origin: "https://attacker.test" },
  });
  assert.equal(mutationOriginAllowed(req), false);
});

test("mutationOriginAllowed allows missing Origin+Referer (non-browser tools)", () => {
  const req = new NextRequest("https://panel.example/api/x", {
    method: "POST",
    headers: { host: "panel.example" },
  });
  assert.equal(mutationOriginAllowed(req), true);
});
