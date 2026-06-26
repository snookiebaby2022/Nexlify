const fs = require("fs");
const path = require("path");

const appDir = process.env.NEXLIFY_DIR || "/var/www/nexlify";

function loadEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const fileEnv = loadEnvFile(path.join(appDir, ".env"));

module.exports = {
  apps: [
    {
      // Must NOT be named "nexlify" — IPTV panel PM2 app uses that name on :3000
      name: "nexlify-web",
      cwd: appDir,
      script: path.join(appDir, "node_modules/next/dist/bin/next"),
      args: "start -p 3001 -H 0.0.0.0",
      env: {
        NODE_ENV: "production",
        PORT: "3001",
        HOSTNAME: "0.0.0.0",
        ...fileEnv,
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "768M",
    },
  ],
};
