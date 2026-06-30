const { readFileSync, existsSync } = require("fs");
const { cpus } = require("os");
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
  process.env.PORT || process.env.PANEL_PORT || fileEnv.PORT || fileEnv.PANEL_PORT || "13000"
);
const websitePort = String(
  process.env.WEBSITE_PORT ||
    process.env.STREAM_HTTP_PORT ||
    fileEnv.WEBSITE_PORT ||
    fileEnv.STREAM_HTTP_PORT ||
    "13001"
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

const standaloneDir = resolve(__dirname, ".next/standalone");
const useStandalone = existsSync(resolve(standaloneDir, "server.js"));

const cpuCount = cpus().length;
const panelInstances = useStandalone
  ? 1
  : process.env.PANEL_INSTANCES
    ? parseInt(process.env.PANEL_INSTANCES, 10)
    : Math.max(2, Math.min(cpuCount, 8));

const sharedPanelEnv = {
  NODE_ENV: "production",
  DATABASE_URL: fileEnv.DATABASE_URL || "",
  JWT_SECRET: fileEnv.JWT_SECRET || "",
  PORT: panelPort,
  PANEL_PORT: panelPort,
  WEBSITE_PORT: websitePort,
  STREAM_HTTP_PORT: websitePort,
  PANEL_BEHIND_NGINX: fileEnv.PANEL_BEHIND_NGINX || "1",
  PANEL_BIND_HOST: bindHost,
  HOSTNAME: bindHost,
  PANEL_PUBLIC_PORT: fileEnv.PANEL_PUBLIC_PORT || "80",
  PANEL_ASSUME_PROXY_SSL: fileEnv.PANEL_ASSUME_PROXY_SSL || "0",
  PANEL_PRIMARY_DOMAIN: fileEnv.PANEL_PRIMARY_DOMAIN || "",
  PANEL_COOKIE_SECURE: fileEnv.PANEL_COOKIE_SECURE || "0",
  NEXLIFY_LICENSE_COOKIE_SECURE: fileEnv.NEXLIFY_LICENSE_COOKIE_SECURE || "0",
  INSTALL_ADMIN_PASSWORD: fileEnv.INSTALL_ADMIN_PASSWORD || "",
  NEXLIFY_LICENSE_VALID: fileEnv.NEXLIFY_LICENSE_VALID || "0",
  NEXLIFY_LICENSE_KEY: fileEnv.NEXLIFY_LICENSE_KEY || "",
  PANEL_TRUST_CLOUDFLARE: fileEnv.PANEL_TRUST_CLOUDFLARE || "1",
};

/** @type {import('pm2').StartOptions} */
module.exports = {
  apps: [
    useStandalone
      ? {
          name: "nexlify",
          cwd: standaloneDir,
          script: "server.js",
          instances: 1,
          exec_mode: "fork",
          autorestart: true,
          max_restarts: 15,
          min_uptime: "15s",
          kill_timeout: 8000,
          env: sharedPanelEnv,
        }
      : {
          name: "nexlify",
          cwd: __dirname,
          script: "node_modules/next/dist/bin/next",
          args: `start -H ${bindHost} -p ${panelPort}`,
          instances: panelInstances,
          exec_mode: "cluster",
          autorestart: true,
          max_restarts: 10,
          min_uptime: "10s",
          kill_timeout: 5000,
          wait_ready: true,
          listen_timeout: 60000,
          env: sharedPanelEnv,
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
        DATABASE_URL: fileEnv.DATABASE_URL || "",
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
