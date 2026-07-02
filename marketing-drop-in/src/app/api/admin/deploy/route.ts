import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { exec } from "child_process";
import { promisify } from "util";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const execAsync = promisify(exec);

const SITE_PATH = process.env.MARKETING_SITE_PATH || process.cwd();
const MAX_OUTPUT = 8000;

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

async function run(cmd: string, cwd: string): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execAsync(cmd, {
      cwd,
      timeout: 300_000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    return { stdout: result.stdout?.slice(-MAX_OUTPUT) || "", stderr: "" };
  } catch (err: any) {
    return {
      stdout: err.stdout?.slice(-MAX_OUTPUT) || "",
      stderr: err.stderr?.slice(-MAX_OUTPUT) || err.message,
    };
  }
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { stdout: gitBranch } = await run("git branch --show-current", SITE_PATH);
    const { stdout: gitLog } = await run("git log --oneline -5", SITE_PATH);
    const { stdout: gitStatus } = await run("git status --short", SITE_PATH);
    const { stdout: pm2List } = await run("pm2 jlist", SITE_PATH);

    let pm2Apps: any[] = [];
    try {
      pm2Apps = JSON.parse(pm2List);
    } catch {}

    const website = pm2Apps.find((a: any) => a.name === "nexlify-website");

    let pkgVersion = "";
    const pkgPath = join(SITE_PATH, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        pkgVersion = pkg.version || "";
      } catch {}
    }

    let releasesVersion = "";
    const relPath = join(SITE_PATH, "src", "lib", "panel-releases.json");
    if (existsSync(relPath)) {
      try {
        const rel = JSON.parse(readFileSync(relPath, "utf-8"));
        releasesVersion = rel.latestVersion || "";
      } catch {}
    }

    return NextResponse.json({
      sitePath: SITE_PATH,
      pkgVersion,
      releasesVersion,
      git: {
        branch: gitBranch.trim(),
        log: gitLog.trim(),
        dirtyFiles: gitStatus.trim().split("\n").filter(Boolean).length,
      },
      pm2: website
        ? {
            name: website.name,
            status: website.pm2_env?.status,
            pid: website.pid,
            uptime: website.pm2_env?.pm_uptime,
            restarts: website.pm2_env?.restart_time,
          }
        : null,
    });
  } catch (error) {
    console.error("[admin/deploy]", error);
    return NextResponse.json({ error: "Failed to get deploy status" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action !== "update-marketing") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const steps: { name: string; output: string; ok: boolean }[] = [];

  const { stdout: pullOut, stderr: pullErr } = await run("git pull origin main --ff-only", SITE_PATH);
  const pullCombined = (pullOut + pullErr).trim();
  steps.push({
    name: "Git pull",
    output: pullCombined,
    ok: pullCombined.includes("Already up to date") || pullCombined.includes("Fast-forward"),
  });

  if (pullCombined.includes("Already up to date")) {
    return NextResponse.json({
      ok: true,
      message: "Already up to date — no changes to deploy.",
      steps,
    });
  }

  const { stdout: installOut, stderr: installErr } = await run("npm install --no-audit --no-fund", SITE_PATH);
  const installCombined = (installOut + installErr).slice(-2000).trim();
  steps.push({ name: "npm install", output: installCombined, ok: !installErr.includes("ERR!") });

  const { stdout: buildOut, stderr: buildErr } = await run("npm run build", SITE_PATH);
  const buildCombined = (buildOut + buildErr).slice(-4000).trim();
  const buildOk = buildCombined.includes("Compiled successfully") || buildCombined.includes("Generating static pages");
  steps.push({ name: "npm run build", output: buildCombined, ok: buildOk });

  if (!buildOk) {
    return NextResponse.json({
      ok: false,
      message: "Build failed — see output below. PM2 was NOT restarted.",
      steps,
    });
  }

  const allOk = steps.every((s) => s.ok);

  const response = NextResponse.json({
    ok: allOk,
    message: allOk
      ? "Marketing website updated. The site will be back in a few seconds."
      : "Some steps had warnings — check output.",
    steps,
  });

  exec("pm2 restart nexlify-website", { cwd: SITE_PATH }, (err) => {
    if (err) console.error("[admin/deploy] PM2 restart failed:", err.message);
  });

  return response;
}
