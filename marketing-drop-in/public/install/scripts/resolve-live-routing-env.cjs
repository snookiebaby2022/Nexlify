#!/usr/bin/env node
/**
 * Auto-detect live routing env for nginx/install scripts (no manual .env edits required).
 * Prints shell-safe export lines for: eval "$(node scripts/resolve-live-routing-env.cjs)"
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = fs.existsSync("/opt/nexlify-panel/package.json")
  ? "/opt/nexlify-panel"
  : path.join(__dirname, "..");

function loadEnv() {
  try {
    require(path.join(root, "scripts/load-env.cjs")).loadEnv(path.join(root, ".env"));
  } catch {
    /* ignore */
  }
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function panelNicIps() {
  const ips = new Set(["127.0.0.1", "::1", "localhost"]);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a && a.address && !a.internal) ips.add(a.address.toLowerCase());
    }
  }
  for (const key of ["SERVER_IP", "PUBLIC_IP", "PANEL_PUBLIC_IP"]) {
    const v = (process.env[key] || "").trim().toLowerCase();
    if (v) ips.add(v);
  }
  return ips;
}

function isIpv4(h) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
}

function hostOnly(raw) {
  const t = String(raw || "").trim();
  if (!t) return "";
  try {
    const u = new URL(t.includes("://") ? t : `http://${t}`);
    return u.hostname.toLowerCase();
  } catch {
    return t.replace(/:\d+$/, "").toLowerCase();
  }
}

function isLocalHost(host, nicIps) {
  const h = hostOnly(host);
  if (!h) return false;
  if (nicIps.has(h)) return true;
  const primary = (process.env.PANEL_PRIMARY_DOMAIN || "").trim().toLowerCase();
  if (primary && (h === primary || h.endsWith(`.${primary}`))) return true;
  return false;
}

function parsePanelDomains(value) {
  if (!value) return { primary: "", extras: [] };
  try {
    const j = typeof value === "string" ? JSON.parse(value) : value;
    const primary = String(j.primaryDomain || "").trim();
    const extras = Array.isArray(j.extraDomains)
      ? j.extraDomains.map((d) => String(d).trim()).filter(Boolean)
      : [];
    return { primary, extras };
  } catch {
    return { primary: "", extras: [] };
  }
}

function serverRole(server) {
  try {
    const ps =
      typeof server.panelSettings === "string"
        ? JSON.parse(server.panelSettings)
        : server.panelSettings;
    return ps?.advanced?.serverRole || "";
  } catch {
    return "";
  }
}

function pickRemoteEdge(servers, nicIps) {
  const mediaOrigin = (process.env.NEXLIFY_MEDIA_ORIGIN || process.env.MEDIA_ORIGIN || "").trim();
  if (mediaOrigin) {
    const h = hostOnly(mediaOrigin);
    const port = process.env.STREAM_HTTP_PORT || process.env.STREAM_EDGE_PORT || "8080";
    if (h && !isLocalHost(h, nicIps)) return `${h}:${port}`;
  }
  const forceLb = (process.env.NEXLIFY_MEDIA_FORCE_LB_IP || "").trim();
  if (forceLb && isIpv4(forceLb) && !nicIps.has(forceLb.toLowerCase())) {
    const port = process.env.STREAM_HTTP_PORT || "8080";
    return `${forceLb}:${port}`;
  }

  const active = servers.filter((s) => s.isActive !== false);
  const remote = active.filter((s) => !isLocalHost(s.host, nicIps) && !s.timeshiftOnly);
  if (!remote.length) return "";

  remote.sort((a, b) => {
    const score = (s) => {
      let n = 0;
      const role = serverRole(s);
      if (role === "lb" || role === "stream") n += 10;
      if (/lb|edge|10gbs|stream/i.test(s.name || "")) n += 5;
      return n - (s.sortOrder || 0) / 1000;
    };
    return score(b) - score(a);
  });

  const pick = remote[0];
  const port = Number(pick.port) > 0 ? Number(pick.port) : 8080;
  return `${hostOnly(pick.host)}:${port}`;
}

function inferTopology(remoteEdge, nicIps) {
  if (!remoteEdge) return "local-edge";
  const h = hostOnly(remoteEdge.split(":")[0]);
  if (h && !isLocalHost(h, nicIps)) return "remote-splice";
  return "local-edge";
}

function uniqHosts(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const h = hostOnly(raw);
    if (!h || h === "localhost" || isIpv4(h)) continue;
    if (seen.has(h)) continue;
    seen.add(h);
    out.push(h);
  }
  return out;
}

async function main() {
  loadEnv();
  const nicIps = panelNicIps();
  const out = {};

  let servers = [];
  let domainSettings = { primary: "", extras: [] };
  try {
    const { PrismaClient } = require(path.join(root, "node_modules/@prisma/client"));
    const prisma = new PrismaClient();
    servers = await prisma.streamServer.findMany({
      select: {
        name: true,
        host: true,
        port: true,
        isActive: true,
        timeshiftOnly: true,
        sortOrder: true,
        domain: true,
        panelSettings: true,
      },
      orderBy: { sortOrder: "asc" },
    });
    const row = await prisma.panelSetting.findUnique({ where: { key: "settings.domains" } });
    domainSettings = parsePanelDomains(row?.value);
    await prisma.$disconnect();
  } catch {
    /* DB unavailable — env/nginx only */
  }

  if (!process.env.NEXLIFY_REMOTE_EDGE && !process.env.REMOTE_EDGE) {
    const remote = pickRemoteEdge(servers, nicIps);
    if (remote) out.NEXLIFY_REMOTE_EDGE = remote;
  }

  if (!process.env.PANEL_PRIMARY_DOMAIN && domainSettings.primary) {
    out.PANEL_PRIMARY_DOMAIN = domainSettings.primary;
  }

  const serverNames = uniqHosts([
    domainSettings.primary,
    ...domainSettings.extra,
    process.env.PANEL_PRIMARY_DOMAIN,
    ...(process.env.PANEL_EXTRA_DOMAINS || "").split(/[,;\s]+/),
    ...servers.filter((s) => isLocalHost(s.host, nicIps)).flatMap((s) =>
      String(s.domain || "")
        .split(/[,;\s|]+/)
        .map((p) => p.trim())
    ),
  ]);
  if (serverNames.length && !process.env.NEXLIFY_PANEL_SERVER_NAMES) {
    out.NEXLIFY_PANEL_SERVER_NAMES = serverNames.join(" ");
  }

  const remote = process.env.NEXLIFY_REMOTE_EDGE || process.env.REMOTE_EDGE || out.NEXLIFY_REMOTE_EDGE || "";
  if (!process.env.NEXLIFY_PLAYBACK_TOPOLOGY && !process.env.NEXLIFY_LIVE_EDGE_MODE) {
    out.NEXLIFY_PLAYBACK_TOPOLOGY = inferTopology(remote, nicIps);
  }

  for (const [k, v] of Object.entries(out)) {
    if (v) process.stdout.write(`export ${k}=${shellQuote(v)}\n`);
  }
}

main().catch(() => process.exit(0));
