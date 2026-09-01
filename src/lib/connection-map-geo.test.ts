import assert from "node:assert/strict";
import test from "node:test";
import { countryMapPosition, latLngToMapPct, stableCountryOffset } from "./connection-map-geo";

test("GB centroid sits on the British Isles, not mid-Atlantic Africa", () => {
  const pos = countryMapPosition("GB");
  assert.ok(pos);
  const [x, y] = pos;
  assert.ok(x > 48 && x < 51, `mapX ${x}`);
  assert.ok(y > 18 && y < 23, `mapY ${y}`);
});

test("US centroid is temperate North America", () => {
  const pos = countryMapPosition("US");
  assert.ok(pos);
  const [x, y] = pos;
  assert.ok(x > 20 && x < 26, `mapX ${x}`);
  assert.ok(y > 26 && y < 32, `mapY ${y}`);
});

test("unknown country does not dump pins on the Sahara default", () => {
  assert.equal(countryMapPosition("ZZ"), null);
});

test("lat/lng conversion is equirectangular", () => {
  const [x, y] = latLngToMapPct(0, 0);
  assert.equal(Math.round(x), 50);
  assert.equal(Math.round(y), 50);
});

test("stableCountryOffset is deterministic", () => {
  assert.deepEqual(stableCountryOffset("abc", 0), stableCountryOffset("abc", 0));
});
