/**
 * Panel production build entrypoint.
 *
 * During in-panel updates (`.update-in-progress`), always build into
 * `.next.staging` then swap — even when an older update worker still runs
 * plain `npm run build` into live `.next` (the classic 88% / panel-down bug).
 *
 * When `NEXLIFY_DIST_DIR` is already set (fast-update `build-compile`), just
 * run `next build` so we do not recurse.
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
  return run(process.execPath, [nextBin, "build"], env);
}

const updating = existsSync(resolve(root, ".update-in-progress"));
const alreadyStaging = Boolean(process.env.NEXLIFY_DIST_DIR?.trim());

if (updating && !alreadyStaging && existsSync(fastUpdate)) {
  console.log(
    "In-panel update detected — building into .next.staging so the live panel stays online ..."
  );
  let code = run("bash", [fastUpdate, "build-prep"]);
  if (code !== 0) process.exit(code);
  code = run("bash", [fastUpdate, "build-compile"]);
  if (code !== 0) process.exit(code);
  code = run("bash", [fastUpdate, "swap"]);
  process.exit(code);
}

if (updating && !alreadyStaging) {
  // Fast-update script missing — still avoid wiping live .next.
  console.log("In-panel update — using NEXLIFY_DIST_DIR=.next.staging");
  process.exit(
    runNextBuild({
      ...process.env,
      NEXLIFY_DIST_DIR: ".next.staging",
      NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=4096",
      NEXT_PRIVATE_WORKER_THREADS: "false",
    })
  );
}

process.exit(runNextBuild(process.env));
