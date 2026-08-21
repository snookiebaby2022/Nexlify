import assert from "node:assert/strict";
import test from "node:test";
import { parseBrandedBuildInput } from "./app-builder-apk";

test("parseBrandedBuildInput validates package fields", () => {
  const parsed = parseBrandedBuildInput({
    appName: "My IPTV",
    packageName: "com.example.iptv",
    primaryColor: "#112233",
  });
  assert.equal(parsed.appName, "My IPTV");
  assert.equal(parsed.packageName, "com.example.iptv");
  assert.equal(parsed.primaryColor, "#112233");
});
