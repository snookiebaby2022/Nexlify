import assert from "node:assert/strict";
import test from "node:test";
import {
  licenseCheckHost,
  normalizeDomain,
  resellerPortalHostsFromEnv,
} from "./domains-host";
import { normalizeResellerDnsInput } from "./reseller-dns";

test("normalizeDomain strips scheme, path, and port", () => {
  assert.equal(normalizeDomain("http://awtech.club:2086/"), "awtech.club");
  assert.equal(normalizeDomain("winstreamz.com:2086"), "winstreamz.com");
  assert.equal(normalizeDomain("Sulu.xyz"), "sulu.xyz");
});

test("normalizeResellerDnsInput returns bare hostname", () => {
  assert.equal(normalizeResellerDnsInput("http://awtech.club:2086/"), "awtech.club");
  assert.equal(normalizeResellerDnsInput("winstreamz.com:2086"), "winstreamz.com");
  assert.equal(normalizeResellerDnsInput("  IPTV.example.com  "), "iptv.example.com");
  assert.equal(normalizeResellerDnsInput(""), null);
  assert.equal(normalizeResellerDnsInput(null), null);
});

test("licenseCheckHost maps reseller portal to primary", () => {
  const prevPrimary = process.env.PANEL_PRIMARY_DOMAIN;
  const prevReseller = process.env.PANEL_RESELLER_PORTAL_HOSTS;
  process.env.PANEL_PRIMARY_DOMAIN = "darkcdn.store";
  process.env.PANEL_RESELLER_PORTAL_HOSTS = "sulu.xyz,n17y1d.xyz";
  try {
    assert.equal(licenseCheckHost("sulu.xyz"), "darkcdn.store");
    assert.equal(licenseCheckHost("darkcdn.store"), "darkcdn.store");
    assert.equal(resellerPortalHostsFromEnv().has("sulu.xyz"), true);
  } finally {
    if (prevPrimary === undefined) delete process.env.PANEL_PRIMARY_DOMAIN;
    else process.env.PANEL_PRIMARY_DOMAIN = prevPrimary;
    if (prevReseller === undefined) delete process.env.PANEL_RESELLER_PORTAL_HOSTS;
    else process.env.PANEL_RESELLER_PORTAL_HOSTS = prevReseller;
  }
});
