import assert from "node:assert/strict";
import test from "node:test";
import { StreamType, CategoryType } from "@prisma/client";
import {
  generatePassword,
  hmacHex,
  hmacHexEqual,
  hmacPayloadFromSearchParams,
  parseBoundedInt,
  parseCategoryType,
  parseStreamType,
} from "./xui-api-utils";

test("generatePassword is random and meets line credential length", () => {
  const a = generatePassword();
  const b = generatePassword();
  assert.notEqual(a, b);
  assert.ok(a.length >= 8);
  assert.ok(/^[A-Za-z0-9]+$/.test(a));
});

test("parseBoundedInt never returns NaN for Prisma take", () => {
  assert.equal(parseBoundedInt("abc", 50, 1, 100), 50);
  assert.equal(parseBoundedInt("0", 50, 1, 100), 1);
  assert.equal(parseBoundedInt("9999", 50, 1, 100), 100);
  assert.equal(parseBoundedInt("25", 50, 1, 100), 25);
});

test("parseStreamType matches XUI.one live/movie/series aliases", () => {
  assert.equal(parseStreamType("1"), StreamType.LIVE);
  assert.equal(parseStreamType("live"), StreamType.LIVE);
  assert.equal(parseStreamType("2"), StreamType.MOVIE);
  assert.equal(parseStreamType("vod"), StreamType.MOVIE);
  assert.equal(parseStreamType("3"), StreamType.SERIES);
  assert.equal(parseStreamType("nope"), null);
});

test("parseCategoryType accepts radio and stream aliases", () => {
  assert.equal(parseCategoryType("radio"), CategoryType.RADIO);
  assert.equal(parseCategoryType("movie"), CategoryType.MOVIE);
});

test("HMAC payload drops hmac query param and compares in constant time", () => {
  const params = new URLSearchParams("api_key=k&action=get_lines&hmac=deadbeef");
  const payload = hmacPayloadFromSearchParams(params);
  assert.equal(payload.includes("hmac="), false);
  const expected = hmacHex("secret", payload);
  assert.equal(hmacHexEqual(expected, expected), true);
  assert.equal(hmacHexEqual("aa", expected), false);
  const flipped = expected.replace(/[0-9a-f]$/, (c) => (c === "0" ? "1" : "0"));
  assert.equal(hmacHexEqual(flipped, expected), false);
});
