#!/usr/bin/env node
/**
 * After apply: full-probe failed LIVE sources, then drop remaining dashboard
 * "issues to fix" (inactive LIVE + leftover lastProbeOk=false).
 *
 * Usage on the panel VPS:
 *   node /opt/nexlify-panel/scripts/repair-dashboard-stream-issues.mjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.env.NEXLIFY_ROOT || process.cwd();

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function cookieHeader(setCookie) {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return list
    .map((c) => String(c).split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

async function main() {
  const env = loadEnv(path.join(ROOT, ".env"));
  const port = env.PANEL_LISTEN || "13000";
  const base = `http://127.0.0.1:${port}`;
  const username = env.INSTALL_ADMIN_USERNAME || env.ADMIN_USERNAME || "admin";
  const password = env.INSTALL_ADMIN_PASSWORD || env.ADMIN_PASSWORD || "";
  if (!password) {
    console.error("INSTALL_ADMIN_PASSWORD missing in .env");
    process.exit(1);
  }

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const cookie = cookieHeader(loginRes.headers.getSetCookie?.() ?? loginRes.headers.get("set-cookie"));
  if (!loginRes.ok || !cookie) {
    console.error("login failed", loginRes.status, await loginRes.text().catch(() => ""));
    process.exit(1);
  }

  async function api(pathname, opts = {}) {
    const res = await fetch(`${base}${pathname}`, {
      ...opts,
      headers: {
        cookie,
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...(opts.headers || {}),
      },
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    return { res, data };
  }

  const deadline = Date.now() + Number(process.env.NEXLIFY_REPAIR_PROBE_MS || 240_000);
  let probed = 0;
  let recovered = 0;

  while (Date.now() < deadline) {
    const { res, data } = await api("/api/admin/stream-errors");
    if (!res.ok) {
      console.error("stream-errors", res.status, data);
      break;
    }
    const ids = (data.streams || data.probeFails || []).map((s) => s.id).filter(Boolean);
    if (!ids.length) break;
    const chunk = ids.slice(0, 8);
    const batch = await api("/api/admin/streams/probe-batch", {
      method: "POST",
      body: JSON.stringify({ streamIds: chunk, fast: false }),
    });
    if (!batch.res.ok) {
      console.error("probe-batch", batch.res.status, batch.data);
      break;
    }
    probed += chunk.length;
    for (const id of chunk) {
      const row = batch.data.results?.[id];
      if (row && !row.error && row.lastProbeOk) recovered += 1;
    }
  }

  const clear = await api("/api/admin/stream-errors", {
    method: "POST",
    body: JSON.stringify({ action: "clear_live_dashboard_issues" }),
  });
  if (!clear.res.ok) {
    console.error("clear_live_dashboard_issues", clear.res.status, clear.data);
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      ok: true,
      probed,
      recoveredBeforeClear: recovered,
      activated: clear.data.activated,
      clearedProbes: clear.data.clearedProbes,
    })
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
