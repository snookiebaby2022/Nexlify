import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractHostname, extractIpAddress } from "./ip-country";

describe("extractHostname", () => {
  it("strips broadcast port from IPv4", () => {
    assert.equal(extractHostname("45.88.138.18:8080"), "45.88.138.18");
    assert.equal(extractIpAddress("45.88.138.18:8080"), "45.88.138.18");
  });

  it("keeps hostnames so GeoIP can resolve them", () => {
    assert.equal(extractIpAddress("lb.example.com:8080"), null);
    assert.equal(extractHostname("lb.example.com:8080"), "lb.example.com");
    assert.equal(extractHostname("https://cdn.example.com/live"), "cdn.example.com");
  });
});
