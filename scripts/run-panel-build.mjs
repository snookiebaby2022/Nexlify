/**
 * Panel production build entrypoint.
 *
 * 1) In-panel updates (`.update-in-progress`): stage → swap so the live panel
 *    stays online (fixes old workers that call plain `npm run build`).
 * 2) Normal VPS rebuilds when a live `.next` already exists: also stage → swap
 *    so `next build` does not race the running PM2 process (ENOENT
 *    build-manifest.json / apple-icon collect failures).
 * 3) When `NEXLIFY_DIST_DIR` is already set (fast-update `build-compile`),
 *    just run `next build` (no recursion).
 */
import { existsSync } from "fs";
import { spawnSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = resolve(root, "node_modules/next/dist/bin/next");
const fastUpdate = resolve(root, "scripts/apply-panel-fast-update.sh");

function run(cmd, args, env = process.env) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...env },
  });
  return r.status ?? 1;
}

function runNextBuild(env = process.env) {
  if (!existsSync(nextBin)) {
    console.error("ERROR: next binary missing — run npm install first");
    return 1;
  }
  return run(process.execPath, [nextBin, "build"], {
    ...env,
    NODE_OPTIONS: env.NODE_OPTIONS || "--max-old-space-size=4096",
    NEXT_PRIVATE_WORKER_THREADS: env.NEXT_PRIVATE_WORKER_THREADS || "false",
  });
}

function hasLiveNext() {
  return (
    existsSync(resolve(root, ".next/BUILD_ID")) ||
    existsSync(resolve(root, ".next/standalone/server.js")) ||
    existsSync(resolve(root, ".next/build-manifest.json"))
  );
}

function stageBuildAndSwap(reason) {
  if (!existsSync(fastUpdate)) return null;
  console.log(`${reason} — building into .next.staging then swapping ...`);
  let code = run("bash", [fastUpdate, "build-prep"]);
  if (code !== 0) return code;
  code = run("bash", [fastUpdate, "build-compile"]);
  if (code !== 0) return code;
  return run("bash", [fastUpdate, "swap"]);
}

const updating = existsSync(resolve(root, ".update-in-progress"));
const alreadyStaging = Boolean(process.env.NEXLIFY_DIST_DIR?.trim());
const forceDirect = process.env.NEXLIFY_BUILD_DIRECT === "1";

if (!alreadyStaging && !forceDirect && existsSync(fastUpdate)) {
  if (updating) {
    process.exit(stageBuildAndSwap("In-panel update detected") ?? 1);
  }
  if (hasLiveNext()) {
    // Avoid racing a running panel that is serving / writing the same .next tree.
    process.exit(stageBuildAndSwap("Live .next present") ?? 1);
  }
}

if (updating && !alreadyStaging) {
  console.log("In-panel update — using NEXLIFY_DIST_DIR=.next.staging");
  const code = runNextBuild({
    ...process.env,
    NEXLIFY_DIST_DIR: ".next.staging",
  });
  if (code !== 0) process.exit(code);
  // Best-effort swap without fast-update script
  run("bash", [
    "-c",
    'if [ -f .next.staging/BUILD_ID ] || [ -f .next.staging/standalone/server.js ]; then ' +
      "bash scripts/prepare-standalone.sh 2>/dev/null || true; " +
      "rm -rf .next.old; " +
      "[ -d .next ] && mv .next .next.old; " +
      "mv .next.staging .next; rm -rf .next.old; " +
      "echo Swapped .next.staging → .next; " +
      "else echo ERROR: staging build invalid; exit 1; fi",
  ]);
  process.exit(0);
}

process.exit(runNextBuild(process.env));
