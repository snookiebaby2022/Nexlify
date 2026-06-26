#!/usr/bin/env node
/**
 * Full dry-run smoke test: marketing site + IPTV panel integration.
 * Usage: node deploy/site-smoke-test.mjs
 *        SMOKE_BASE=https://nexlify.live node deploy/site-smoke-test.mjs
 */

const MARKETING_BASE = process.env.SMOKE_BASE?.replace(/\/$/, "") || "https://nexlify.live";
const PANEL_DEMO = process.env.SMOKE_PANEL_DEMO || "https://panel.demo.nexlify.live";
const PANEL_STAGING = process.env.SMOKE_PANEL_STAGING || "https://panel.nexlify.live";

const SITES = [
  {
    name: "Marketing site",
    base: MARKETING_BASE,
    paths: [
      "/",
      "/help",
      "/updates",
      "/pricing",
      "/login",
      "/register",
      "/demo",
      "/install",
      "/requirements",
      "/support",
      "/terms",
      "/refund-policy",
      "/docs/whmcs",
    ],
    expectText: ["Nexlify"],
    pathExpect: {
      "/": [
        "IPTV panel preview",
        "Dashboard",
        "Subscriptions",
        "Most Watched By Country",
        "Expiring Lines",
        "Video management",
        "panel.demo.nexlify.live",
        "Try live demo",
        "see it live",
        "data-panel-carousel",
        "data-mock-most-watched",
        "data-mock-xui-cards",
      ],
      "/demo": ["IPTV panel demo", "panel.demo.nexlify.live", "Open live demo"],
      "/install": ["installer", "IPTV"],
      "/docs/whmcs": ["WHMCS", "license"],
      "/requirements": ["Requirements", "Ubuntu"],
      "/pricing": ["license", "7-day trial"],
      "/help": ["Help", "FAQ"],
    },
    jsonPaths: [
      { path: "/api/health", expect: { ok: true } },
      { path: "/api/plans", expectKeys: ["plans"] },
    ],
    xmlPaths: ["/sitemap.xml", "/robots.txt"],
  },
  {
    name: "Panel demo (sandbox)",
    base: PANEL_DEMO,
    paths: ["/login"],
    expectText: ["Sign in"],
    pathExpect: {
      "/login": ["Demo logins", "Sign in"],
    },
    jsonPaths: [
      {
        path: "/api/health",
        expectKeys: ["status"],
        expectStatusOk: true,
      },
    ],
  },
  {
    name: "Panel staging",
    base: PANEL_STAGING,
    paths: ["/login"],
    expectText: ["Sign in"],
    forbidText: ["Demo logins"],
    jsonPaths: [
      {
        path: "/api/health",
        expectKeys: ["status"],
        expectStatusOk: true,
      },
    ],
  },
];

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let failed = 0;
let passed = 0;

function norm(s) {
  return s.toLowerCase();
}

function textIncludes(haystack, needle) {
  return norm(haystack).includes(norm(needle));
}

async function checkPage(site, path) {
  const url = `${site.base}${path}`;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
    });
    const text = await res.text();
    const globalMissing = (site.expectText ?? []).filter((s) => !textIncludes(text, s));
    const pathRules = site.pathExpect?.[path] ?? [];
    const pathMissing = pathRules.filter((s) => !textIncludes(text, s));
    const forbidden = (site.forbidText ?? []).filter((s) => textIncludes(text, s));

    if (!res.ok || globalMissing.length || pathMissing.length || forbidden.length) {
      failed++;
      console.log(`  FAIL ${res.status} ${url}`);
      if (globalMissing.length) console.log(`       missing (global): ${globalMissing.join(", ")}`);
      if (pathMissing.length) console.log(`       missing (${path}): ${pathMissing.join(", ")}`);
      if (forbidden.length) console.log(`       forbidden: ${forbidden.join(", ")}`);
      return;
    }
    passed++;
    console.log(`  OK   ${res.status} ${url}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${url} — ${err instanceof Error ? err.message : err}`);
  }
}

async function checkJson(site, check) {
  const url = `${site.base}${check.path}`;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { Accept: "application/json", "User-Agent": "NexlifySmokeTest/1.0" },
    });
    const data = await res.json();
    const bad = Object.entries(check.expect ?? {}).filter(([k, v]) => data[k] !== v);
    const missingKeys = (check.expectKeys ?? []).filter((k) => !(k in data));
    const statusBad =
      check.expectStatusOk && data.status && data.status !== "healthy" && data.status !== "ok";

    if (!res.ok || bad.length || missingKeys.length || statusBad) {
      failed++;
      console.log(`  FAIL ${res.status} ${url}`);
      if (bad.length) console.log(`       json mismatch: ${bad.map(([k]) => k).join(", ")}`);
      if (missingKeys.length) console.log(`       missing keys: ${missingKeys.join(", ")}`);
      if (statusBad) console.log(`       unhealthy status: ${data.status}`);
      return;
    }
    passed++;
    console.log(`  OK   ${res.status} ${url}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${url} — ${err instanceof Error ? err.message : err}`);
  }
}

async function checkXml(site, path) {
  const url = `${site.base}${path}`;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": BROWSER_UA },
    });
    const text = await res.text();
    const ok =
      res.ok &&
      (path.endsWith("sitemap.xml")
        ? text.includes("<urlset") && text.includes("nexlify.live")
        : text.includes("User-agent") && text.includes("Sitemap"));

    if (!ok) {
      failed++;
      console.log(`  FAIL ${res.status} ${url} (invalid ${path})`);
      return;
    }
    passed++;
    console.log(`  OK   ${res.status} ${url}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${url} — ${err instanceof Error ? err.message : err}`);
  }
}

async function checkPanelIntegration() {
  console.log("\n== Panel ↔ marketing integration");
  try {
    const home = await fetch(`${MARKETING_BASE}/`, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
    });
    const html = await home.text();
    const demoLink = PANEL_DEMO.replace(/\/$/, "");
    if (!html.includes(demoLink) && !html.includes("panel.demo.nexlify.live")) {
      failed++;
      console.log(`  FAIL homepage missing demo panel URL (${demoLink})`);
    } else {
      passed++;
      console.log(`  OK   homepage links to demo panel`);
    }

    const [demoHealth, stagingHealth] = await Promise.all([
      fetch(`${PANEL_DEMO}/api/health`).then((r) => r.json().catch(() => ({}))),
      fetch(`${PANEL_STAGING}/api/health`).then((r) => r.json().catch(() => ({}))),
    ]);
    if (demoHealth.status !== "healthy" && demoHealth.ok !== true) {
      failed++;
      console.log(`  FAIL demo panel health: ${JSON.stringify(demoHealth)}`);
    } else {
      passed++;
      console.log(`  OK   demo panel /api/health`);
    }
    if (stagingHealth.status !== "healthy" && stagingHealth.ok !== true) {
      failed++;
      console.log(`  FAIL staging panel health: ${JSON.stringify(stagingHealth)}`);
    } else {
      passed++;
      console.log(`  OK   staging panel /api/health`);
    }

    const licenseProbe = await fetch(`${MARKETING_BASE}/api/licenses/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "" }),
    });
    if (licenseProbe.status >= 500) {
      failed++;
      console.log(`  FAIL license validate API returned ${licenseProbe.status}`);
    } else {
      passed++;
      console.log(`  OK   license validate API responds (${licenseProbe.status})`);
    }
  } catch (err) {
    failed++;
    console.log(`  FAIL integration — ${err instanceof Error ? err.message : err}`);
  }
}

for (const site of SITES) {
  console.log(`\n== ${site.name} (${site.base})`);
  for (const path of site.paths) {
    await checkPage(site, path);
  }
  for (const check of site.jsonPaths ?? []) {
    await checkJson(site, check);
  }
  for (const path of site.xmlPaths ?? []) {
    await checkXml(site, path);
  }
}

await checkPanelIntegration();

console.log(
  failed
    ? `\n${failed} check(s) failed, ${passed} passed.`
    : `\nAll ${passed} smoke checks passed.`
);
process.exit(failed ? 1 : 0);
