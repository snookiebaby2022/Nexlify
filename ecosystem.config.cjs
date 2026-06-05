const { readFileSync, existsSync } = require("fs");
const { resolve } = require("path");

function loadEnv() {
  const envPath = resolve(__dirname, ".env");
  const out = {};
  if (!existsSync(envPath)) return out;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[line.slice(0, i).trim()] = val;
  }
  return out;
}

const fileEnv = loadEnv();
const panelPort = String(
  process.env.PORT || process.env.PANEL_PORT || fileEnv.PORT || fileEnv.PANEL_PORT || "3000"
);
const websitePort = String(
  process.env.WEBSITE_PORT ||
    process.env.STREAM_HTTP_PORT ||
    fileEnv.WEBSITE_PORT ||
    fileEnv.STREAM_HTTP_PORT ||
    "3001"
);
const bindHost =
  process.env.PANEL_BIND_HOST ||
  fileEnv.PANEL_BIND_HOST ||
  (process.env.PANEL_BEHIND_NGINX === "1" ||
  process.env.PANEL_BEHIND_NGINX === "true" ||
  fileEnv.PANEL_BEHIND_NGINX === "1" ||
  fileEnv.PANEL_BEHIND_NGINX === "true"
    ? "127.0.0.1"
    : "0.0.0.0");

/** @type {import('pm2').StartOptions} */
module.exports = {
  apps: [
    {
      name: "nexlify",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: `start -H ${bindHost} -p ${panelPort}`,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      env: {
        NODE_ENV: "production",
        PORT: panelPort,
        PANEL_PORT: panelPort,
        WEBSITE_PORT: websitePort,
        STREAM_HTTP_PORT: websitePort,
        PANEL_BEHIND_NGINX: fileEnv.PANEL_BEHIND_NGINX || process.env.PANEL_BEHIND_NGINX || "",
        PANEL_BIND_HOST: bindHost,
      },
    },
    {
      name: "nexlify-cron",
      cwd: __dirname,
      script: "node_modules/tsx/dist/cli.mjs",
      args: "scripts/cron-daemon.ts",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "nexlify-license",
      cwd: __dirname,
      script: "license-server/server.mjs",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      env: {
        NODE_ENV: "production",
        LICENSE_SERVER_PORT: "8787",
      },
    },
  ],
};
