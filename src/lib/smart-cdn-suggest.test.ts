import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractHostnamesFromServer,
  urlsForCloudflareHost,
} from "./smart-cdn-suggest";

describe("smart-cdn-suggest", () => {
  it("extracts Cloudflare hostnames from migrated protocol field", () => {
    const hits = extractHostnamesFromServer({
      name: "Edge",
      domain: null,
      protocol: "bladesmedia.topmedia.win,solut24.xyz",
      host: "1.2.3.4",
      port: 2052,
    });
    assert.equal(hits.length, 2);
    assert.equal(hits[0]?.hostname, "bladesmedia.topmedia.win");
    assert.equal(hits[0]?.port, 2052);
  });

  it("skips bare protocol labels and IPs", () => {
    const hits = extractHostnamesFromServer({
      name: "Main",
      domain: null,
      protocol: "http",
      host: "45.88.138.18",
      port: 80,
    });
    assert.equal(hits.length, 0);
  });

  it("builds Cloudflare URL candidates including alt ports", () => {
    const urls = urlsForCloudflareHost("cdn.example.com", 2052);
    assert.ok(urls.includes("https://cdn.example.com"));
    assert.ok(urls.includes("http://cdn.example.com:2052"));
  });
});
