import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasHostedDirectSource,
  hasProviderSource,
  validateStreamCreate,
} from "./stream-source";

test("hosted tick plus existing URL is enough — no provider catalog path required", () => {
  assert.equal(
    hasHostedDirectSource({
      hostedExternally: true,
      streamUrl: "http://provider.example.com/live/u/p/1",
    }),
    true
  );
  assert.equal(
    hasProviderSource({
      hostedExternally: true,
      providerId: "",
      providerPath: "",
    }),
    false
  );
  assert.equal(
    validateStreamCreate({
      type: "LIVE",
      hostedExternally: true,
      streamUrl: "http://provider.example.com/live/u/p/1",
    }),
    null
  );
  assert.equal(
    validateStreamCreate({
      type: "MOVIE",
      hostedExternally: true,
      source: "https://provider.example.com/movie/u/p/9.mp4",
    }),
    null
  );
});

test("hosted tick without URL or provider path is rejected", () => {
  assert.equal(
    validateStreamCreate({
      type: "LIVE",
      hostedExternally: true,
    }),
    "Paste the provider URL, or pick a provider and path"
  );
});

test("provider id + path still counts as a hosted catalog source", () => {
  assert.equal(
    validateStreamCreate({
      type: "MOVIE",
      hostedExternally: true,
      providerId: "prov_1",
      providerPath: "12345",
    }),
    null
  );
});
