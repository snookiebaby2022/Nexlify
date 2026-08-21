#!/usr/bin/env node
const fs = require("fs");
const { execSync } = require("child_process");

function parseEnvSecret() {
  const env = fs.readFileSync(".env", "utf8");
  for (const line of env.split("\n")) {
    if (!line.startsWith("PANEL_INTERNAL_SECRET=")) continue;
    let v = line.slice("PANEL_INTERNAL_SECRET=".length).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return "";
}

const pm2 = JSON.parse(execSync("pm2 jlist", { encoding: "utf8" }));
const panel = pm2.find((x) => x.name === "nexlify")?.pm2_env?.env?.PANEL_INTERNAL_SECRET ?? "";
const edge = pm2.find((x) => x.name === "nexlify-iptv-edge")?.pm2_env?.env?.PANEL_INTERNAL_SECRET ?? "";
const file = parseEnvSecret();

console.log(JSON.stringify({
  fileLen: file.length,
  panelLen: panel.length,
  edgeLen: edge.length,
  fileEqPanel: file === panel,
  fileEqEdge: file === edge,
  panelEqEdge: panel === edge,
}, null, 2));
