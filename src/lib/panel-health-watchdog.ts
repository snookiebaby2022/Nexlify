import { execSync, spawn } from "child_process";
import { access } from "fs/promises";
import path from "path";
import { getResolvedRepoPath, getPanelServerSettings } from "@/lib/panel-server";
import { isJobRunning, reconcileStaleUpdateJob } from "@/lib/panel-update-job";

const COOLDOWN_MS = 5 * 60 * 1000;
const SETTING_KEY = "panel_health_restart_at";

function readEnvPort(repoPath: string): { host: string; port: string } {
  try {
    const raw = execSync(
      "bash -lc 'set -a; [ -f .env ] && . ./.env; printf \"%s|%s\" \"${PANEL_BIND_HOST:-127.0.0.1}\" \"${PORT:-${PANEL_PORT:-13000}}\"'",
      {
        cwd: repoPath,
        encoding: "utf8",
        timeout: 5000,
      }
    ).trim();
    const [host = "127.0.0.1", port = "13000"] = raw.split("|");
    return { host, port };
  } catch (err) {
    console.warn("watchdog: failed to read .env port", err instanceof Error ? err.message : err);
    return { host: "127.0.0.1", port: "13000" };
  }
}

function pm2NexlifyOnline(): boolean {
  try {
    const out = execSync("pm2 jlist 2>/dev/null", { encoding: "utf8", timeout: 8000 });
    const list = JSON.parse(out) as { name?: string; pm2_env?: { status?: string } }[];
    const apps = list.filter((a) => a.name === "nexlify");
    return apps.some((a) => a.pm2_env?.status === "online");
  } catch (err) {
    console.warn("watchdog: pm2 jlist parse failed", err instanceof Error ? err.message : err);
    return false;
  }
}

function curlHealth(host: string, port: string): boolean {
  try {
    execSync(`curl -fsS --max-time 5 "http://${host}:${port}/api/health" >/dev/null`, {
      timeout: 8000,
    });
    return true;
  } catch (err) {
    console.warn("watchdog: curl health check failed", err instanceof Error ? err.message : err);
    return false;
  }
}

async function lastRestartMs(): Promise<number> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const row = await prisma.panelSetting.findUnique({ where: { key: SETTING_KEY } });
    const ms = row?.value ? Date.parse(row.value) : NaN;
    return Number.isFinite(ms) ? ms : 0;
  } catch (err) {
    console.warn("watchdog: failed to read last restart time", err instanceof Error ? err.message : err);
    return 0;
  }
}

async function recordRestartAttempt(): Promise<void> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const now = new Date().toISOString();
    await prisma.panelSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value: now },
      create: { key: SETTING_KEY, value: now },
    });
  } catch (err) {
    console.warn("watchdog: failed to record restart attempt", err instanceof Error ? err.message : err);
  }
}

async function restartScriptPath(repoPath: string): Promise<string | null> {
  const script = path.join(repoPath, "scripts", "panel-restart-safe.sh");
  try {
    await access(script);
    return script;
  } catch (err) {
    console.warn("watchdog: restart script not found, trying fallback", err instanceof Error ? err.message : err);
    const fallback = path.join(repoPath, "scripts", "pm2-start.sh");
    try {
      await access(fallback);
      return fallback;
    } catch (err) {
      console.warn("watchdog: fallback restart script also not found", err instanceof Error ? err.message : err);
      return null;
    }
  }
}

function spawnDetachedRestart(repoPath: string, script: string): void {
  const isSafe = script.endsWith("panel-restart-safe.sh");
  const args = isSafe
    ? ["bash", script, "--detach"]
    : ["bash", script];
  try {
    spawn("setsid", args, {
      cwd: repoPath,
      detached: true,
      stdio: "ignore",
      env: process.env,
    }).unref();
  } catch (err) {
    console.warn("watchdog: setsid spawn failed, falling back to bash", err instanceof Error ? err.message : err);
    spawn("bash", [...args, ...(isSafe ? [] : [])], {
      cwd: repoPath,
      detached: true,
      stdio: "ignore",
      env: process.env,
    }).unref();
  }
}

/** Recover panel when nexlify is down but nexlify-cron is still running. */
export async function maybeRestartUnhealthyPanel(): Promise<{
  action: "ok" | "skipped" | "restarting";
  reason: string;
}> {
  if (process.platform !== "linux") {
    return { action: "skipped", reason: "not_linux" };
  }

  const server = await getPanelServerSettings();
  const repoPath = getResolvedRepoPath(server);
  const job = await reconcileStaleUpdateJob(repoPath);
  if (isJobRunning(job)) {
    return { action: "skipped", reason: "update_running" };
  }

  const { host, port } = readEnvPort(repoPath);
  const pm2Up = pm2NexlifyOnline();
  const healthy = pm2Up && curlHealth(host, port);

  if (healthy) {
    return { action: "ok", reason: "healthy" };
  }

  const last = await lastRestartMs();
  if (Date.now() - last < COOLDOWN_MS) {
    return { action: "skipped", reason: "cooldown" };
  }

  const script = await restartScriptPath(repoPath);
  if (!script) {
    return { action: "skipped", reason: "no_restart_script" };
  }

  const recoverScript = path.join(repoPath, "scripts", "panel-update-recover.sh");
  let buildMissing = false;
  try {
    execSync("bash scripts/has-valid-next-build.sh", { cwd: repoPath, timeout: 8000, stdio: "ignore" });
  } catch (err) {
    console.warn("watchdog: build validation failed", err instanceof Error ? err.message : err);
    buildMissing = true;
  }

  if (buildMissing) {
    try {
      await access(recoverScript);
      await recordRestartAttempt();
      spawn("bash", [recoverScript], {
        cwd: repoPath,
        detached: true,
        stdio: "ignore",
        env: process.env,
      }).unref();
      return { action: "restarting", reason: "recover_missing_build" };
    } catch (err) {
      console.warn("watchdog: recover script failed, falling through to normal restart", err instanceof Error ? err.message : err);
    }
  }

  await recordRestartAttempt();
  spawnDetachedRestart(repoPath, script);

  const detail = pm2Up ? "health_failed" : "nexlify_down";
  return { action: "restarting", reason: detail };
}
