/**
 * Run next dev/start with PORT from .env (cross-platform).
 * Usage: node scripts/run-next.mjs dev|start
 */
import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { resolvePortFromEnv, resolveBindHostFromEnv, loadEnvFile } from "./read-env-port.mjs";

const mode = process.argv[2];
if (mode !== "dev" && mode !== "start") {
  console.error("Usage: node scripts/run-next.mjs <dev|start>");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = loadEnvFile();
const port = resolvePortFromEnv(env);
const bindHost = resolveBindHostFromEnv(env);

for (const [k, v] of Object.entries(env)) {
  if (process.env[k] === undefined) process.env[k] = v;
}
process.env.PORT = String(port);
process.env.PANEL_PORT = String(port);

const nextBin = resolve(root, "node_modules/next/dist/bin/next");
const args =
  mode === "dev"
    ? ["dev", "--hostname", bindHost, "-p", String(port)]
    : ["start", "--hostname", bindHost, "-p", String(port)];

console.log(`Starting Nexlify on http://${bindHost}:${port} (${mode})`);

const child = spawn(process.execPath, [nextBin, ...args], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
