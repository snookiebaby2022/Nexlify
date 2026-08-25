import assert from "node:assert/strict";
import test from "node:test";
import { collectStreamServerPublicHosts } from "./panel-public-hosts";

test("collectStreamServerPublicHosts includes domain and every rotator host", () => {
  const hosts = collectStreamServerPublicHosts({
    host: "45.88.138.18",
    domain: "tv.example.com",
    dnsRotator: {
      mode: "round_robin",
      hosts: ["https://cdn1.example.com", "cdn2.example.com", "45.88.138.18"],
    },
  });
  assert.deepEqual(hosts.sort(), ["cdn1.example.com", "cdn2.example.com", "tv.example.com"]);
});
