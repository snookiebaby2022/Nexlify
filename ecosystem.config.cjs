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

function pgBinPath() {
  const extra = [
    "/usr/local/bin",
    "/usr/lib/postgresql/18/bin",
    "/usr/lib/postgresql/17/bin",
    "/usr/lib/postgresql/16/bin",
    "/usr/lib/postgresql/15/bin",
    "/usr/lib/postgresql/14/bin",
    "/usr/bin",
    "/bin",
  ].join(":");
  return `${extra}:${process.env.PATH || "/usr/bin:/bin"}`;
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
const panelInstances = process.env.PANEL_INSTANCES
  ? parseInt(process.env.PANEL_INSTANCES, 10)
  : 1;

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
  PANEL_REPO_PATH: fileEnv.PANEL_REPO_PATH || __dirname,
  SMTP_HOST: fileEnv.SMTP_HOST || "",
  SMTP_PORT: fileEnv.SMTP_PORT || "",
  SMTP_USER: fileEnv.SMTP_USER || "",
  SMTP_PASS: fileEnv.SMTP_PASS || "",
  SMTP_FROM: fileEnv.SMTP_FROM || "",
  PANEL_API_SECRET: fileEnv.PANEL_API_SECRET || "",
  NEXLIFY_PANEL_API_SECRET: fileEnv.NEXLIFY_PANEL_API_SECRET || "",
  PANEL_INTERNAL_SECRET: fileEnv.PANEL_INTERNAL_SECRET || "",
  NEXLIFY_LICENSE_SKIP_HOST_CHECK: fileEnv.NEXLIFY_LICENSE_SKIP_HOST_CHECK || "",
  PATH: pgBinPath(),
  // Cap panel heap — large imports temporarily need room, but 4GB invites bloat.
  NODE_OPTIONS: fileEnv.NODE_OPTIONS || "--max-old-space-size=1536",
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
          max_memory_restart: "1800M",
          env: sharedPanelEnv,
        }
      : {
          name: "nexlify",
          cwd: __dirname,
          script: "node_modules/next/dist/bin/next",
          args: `start -H ${bindHost} -p ${panelPort}`,
          instances: 1,
          exec_mode: "fork",
          autorestart: true,
          max_restarts: 10,
          min_uptime: "10s",
          kill_timeout: 5000,
          listen_timeout: 60000,
          max_memory_restart: "1800M",
          env: sharedPanelEnv,
        },
    {
      name: "nexlify-cron",
      cwd: __dirname,
      script: "scripts/run-cron-daemon.sh",
      interpreter: "bash",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "700M",
      env: {
        NODE_ENV: "production",
        DATABASE_URL: fileEnv.DATABASE_URL || "",
        PATH: pgBinPath(),
        NEXLIFY_CRON_MAX_OLD_SPACE_MB: fileEnv.NEXLIFY_CRON_MAX_OLD_SPACE_MB || "512",
        NEXLIFY_CRON_RECYCLE_RSS_MB: fileEnv.NEXLIFY_CRON_RECYCLE_RSS_MB || "400",
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
    {
      name: "nexlify-web",
      cwd: resolve(__dirname, "marketing-drop-in"),
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 13001",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      env: {
        NODE_ENV: "production",
        DATABASE_URL: fileEnv.DATABASE_URL || "",
        JWT_SECRET: fileEnv.JWT_SECRET || "",
        STRIPE_SECRET_KEY: fileEnv.STRIPE_SECRET_KEY || "",
        SMTP_HOST: fileEnv.SMTP_HOST || "smtp.gmail.com",
        SMTP_PORT: fileEnv.SMTP_PORT || "587",
        SMTP_USER: fileEnv.SMTP_USER || "",
        SMTP_PASS: fileEnv.SMTP_PASS || "",
        SMTP_FROM: fileEnv.SMTP_FROM || "Nexlify <admin@nexlify.live>",
        PANEL_API_SECRET: fileEnv.PANEL_API_SECRET || "",
        NEXLIFY_PANEL_API_SECRET: fileEnv.NEXLIFY_PANEL_API_SECRET || "",
      },
    },
  ],
};
