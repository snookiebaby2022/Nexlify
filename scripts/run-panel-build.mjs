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
 *
 * Concurrent `next build` processes corrupt `.next` (ENOENT manifests / SIGKILL
 * on low-RAM boxes). Exclusive flock via bash wraps the whole entry on Linux.
 */
import { existsSync } from "fs";
import { spawnSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = resolve(root, "node_modules/next/dist/bin/next");
const fastUpdate = resolve(root, "scripts/apply-panel-fast-update.sh");
const buildLock = "/tmp/nexlify-panel-build.lock";

function run(cmd, args, env = process.env) {
  let executable = cmd;
  let shell = false;
  if (process.platform === "win32" && cmd === "bash") {
    const candidates = [
      env.NEXLIFY_BASH_BIN,
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    ].filter(Boolean);
    executable = candidates.find((candidate) => existsSync(candidate)) || cmd;
  } else if (process.platform === "win32" && cmd === "npm") {
    // npm is a .cmd shim on Windows and requires cmd.exe.
    shell = true;
  }
  const r = spawnSync(executable, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...env },
    shell,
  });
  return r.status ?? 1;
}

function ensureBuildDeps() {
  const needed = ["tailwindcss", "postcss", "autoprefixer"];
  const missing = needed.filter(
    (p) => !existsSync(resolve(root, "node_modules", p, "package.json"))
  );
  if (missing.length === 0) return 0;
  console.log(
    `Build deps missing (${missing.join(", ")}) — npm install --include=dev --include=optional`
  );
  return run("npm", ["install", "--include=dev", "--include=optional", "--no-audit", "--no-fund"]);
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

function mainUnlocked() {
  if (ensureBuildDeps() !== 0) return 1;

  const updating = existsSync(resolve(root, ".update-in-progress"));
  const alreadyStaging = Boolean(process.env.NEXLIFY_DIST_DIR?.trim());
  const forceDirect = process.env.NEXLIFY_BUILD_DIRECT === "1";

  if (!alreadyStaging && !forceDirect && existsSync(fastUpdate)) {
    if (updating) {
      return stageBuildAndSwap("In-panel update detected") ?? 1;
    }
    if (hasLiveNext()) {
      // Avoid racing a running panel that is serving / writing the same .next tree.
      return stageBuildAndSwap("Live .next present") ?? 1;
    }
  }

  if (updating && !alreadyStaging) {
    console.log("In-panel update — using NEXLIFY_DIST_DIR=.next.staging");
    const code = runNextBuild({
      ...process.env,
      NEXLIFY_DIST_DIR: ".next.staging",
    });
    if (code !== 0) return code;
    // Best-effort swap without fast-update script
    return run("bash", [
      "-c",
      'if [ -f .next.staging/BUILD_ID ] || [ -f .next.staging/standalone/server.js ]; then ' +
        "export NEXLIFY_DIST_DIR=.next.staging; bash scripts/prepare-standalone.sh 2>/dev/null || true; " +
        "rm -rf .next.old; " +
        "[ -d .next ] && mv .next .next.old; " +
        "mv .next.staging .next; " +
        "export NEXLIFY_DIST_DIR=.next; " +
        "bash scripts/fix-next-distdir-references.sh .next 2>/dev/null || true; " +
        "bash scripts/prepare-standalone.sh 2>/dev/null || true; " +
        "rm -rf .next.old; " +
        "echo Swapped .next.staging → .next; " +
        "else echo ERROR: staging build invalid; exit 1; fi",
    ]);
  }

  return runNextBuild(process.env);
}

// Single-flight lock: watchdog + manual update + deploy must not stack next build.
if (
  process.platform !== "win32" &&
  process.env.NEXLIFY_SKIP_BUILD_LOCK !== "1" &&
  process.env.NEXLIFY_BUILD_LOCK_HELD !== "1"
) {
  const r = spawnSync(
    "bash",
    [
      "-c",
      'exec 9>"$1"; if ! flock -n 9; then echo "ERROR: another panel build holds $1 — aborting to avoid corrupting .next" >&2; exit 75; fi; export NEXLIFY_BUILD_LOCK_HELD=1; exec "$2" "$3"',
      "_",
      buildLock,
      process.execPath,
      resolve(root, "scripts/run-panel-build.mjs"),
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, NEXLIFY_BUILD_LOCK_HELD: "1" },
    }
  );
  if (r.error && /ENOENT|spawn bash/i.test(String(r.error.message || r.error))) {
    console.warn("WARN: flock/bash unavailable — building without mutex");
    process.exit(mainUnlocked());
  }
  process.exit(r.status ?? 1);
}

process.exit(mainUnlocked());
