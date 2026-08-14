import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const execAsync = promisify(exec);

const SITE_PATH = process.env.MARKETING_SITE_PATH || process.cwd();
const PANEL_PATH =
  process.env.NEXLIFY_PANEL_PATH ||
  ["/home/nexlify", "/home/nexlify-panel", "/opt/nexlify-panel"].find((p) =>
    existsSync(join(p, "package.json"))
  ) ||
  "/home/nexlify";
const MARKETING_SOURCE =
  process.env.MARKETING_SOURCE_PATH || join(PANEL_PATH, "marketing-drop-in");
const PM2_NAME = process.env.MARKETING_PM2_NAME || "nexlify-web";
const MAX_OUTPUT = 8000;

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

async function run(cmd: string, cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execAsync(cmd, {
      cwd,
      timeout: 300_000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: "0", NODE_ENV: "development" },
    });
    return { stdout: result.stdout?.slice(-MAX_OUTPUT) || "", stderr: "", code: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout?.slice(-MAX_OUTPUT) || "",
      stderr: err.stderr?.slice(-MAX_OUTPUT) || err.message,
      code: typeof err.code === "number" ? err.code : 1,
    };
  }
}

function findPm2App(pm2Apps: any[]) {
  return (
    pm2Apps.find((a: any) => a.name === PM2_NAME) ||
    pm2Apps.find((a: any) => a.name === "nexlify-web") ||
    pm2Apps.find((a: any) => a.name === "nexlify-website") ||
    null
  );
}

async function syncMarketingSource(): Promise<{ output: string; ok: boolean }> {
  if (!existsSync(MARKETING_SOURCE)) {
    return {
      output: `No marketing source at ${MARKETING_SOURCE} — using files already in ${SITE_PATH}`,
      ok: true,
    };
  }

  const { stdout, stderr, code } = await run(
    `rsync -a --delete --exclude node_modules --exclude .next --exclude .env --exclude src/generated "${MARKETING_SOURCE}/" "${SITE_PATH}/"`,
    "/",
  );
  const output = (stdout + stderr).trim();
  return { output: output || `Synced from ${MARKETING_SOURCE}`, ok: code === 0 };
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const panelGit = existsSync(join(PANEL_PATH, ".git"));
    const siteGit = existsSync(join(SITE_PATH, ".git"));
    const { stdout: gitBranch } = panelGit
      ? await run("git branch --show-current", PANEL_PATH)
      : siteGit
        ? await run("git branch --show-current", SITE_PATH)
        : { stdout: "—", stderr: "", code: 0 };
    const gitRoot = panelGit ? PANEL_PATH : siteGit ? SITE_PATH : PANEL_PATH;
    const { stdout: gitLog } = existsSync(join(gitRoot, ".git"))
      ? await run("git log --oneline -5", gitRoot)
      : { stdout: "Not a git repository", stderr: "", code: 0 };
    const { stdout: gitStatus } = existsSync(join(gitRoot, ".git"))
      ? await run("git status --short", gitRoot)
      : { stdout: "", stderr: "", code: 0 };
    const { stdout: pm2List } = await run("pm2 jlist", SITE_PATH);

    let pm2Apps: any[] = [];
    try {
      pm2Apps = JSON.parse(pm2List);
    } catch {}

    const website = findPm2App(pm2Apps);

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
      marketingSource: MARKETING_SOURCE,
      pkgVersion,
      releasesVersion,
      git: {
        branch: gitBranch.trim(),
        log: gitLog.trim(),
        dirtyFiles: gitStatus.trim().split("\n").filter(Boolean).length,
        panelRepo: panelGit,
        siteRepo: siteGit,
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

  const panelGit = join(PANEL_PATH, ".git");
  if (existsSync(panelGit)) {
    const { stdout, stderr, code } = await run("git pull origin main --ff-only", PANEL_PATH);
    const pullCombined = (stdout + stderr).trim();
    steps.push({
      name: "Git pull (panel repo)",
      output: pullCombined,
      ok: code === 0 && (pullCombined.includes("Already up to date") || pullCombined.includes("Fast-forward")),
    });
  } else {
    steps.push({
      name: "Git pull (panel repo)",
      output: `Skipped — no git repo at ${PANEL_PATH}`,
      ok: true,
    });
  }

  const sync = await syncMarketingSource();
  steps.push({ name: "Sync marketing source", ...sync });

  const { stdout: installOut, stderr: installErr, code: installCode } = await run(
    "npm install --include=dev --no-audit --no-fund",
    SITE_PATH,
  );
  const installCombined = (installOut + installErr).slice(-2000).trim();
  steps.push({
    name: "npm install",
    output: installCombined,
    ok: installCode === 0 && !installCombined.includes("ERR!"),
  });

  const { stdout: buildOut, stderr: buildErr, code: buildCode } = await run("npm run build", SITE_PATH);
  const buildCombined = (buildOut + buildErr).slice(-4000).trim();
  const buildOk =
    buildCode === 0 &&
    (buildCombined.includes("Compiled successfully") ||
      buildCombined.includes("Generating static pages") ||
      buildCombined.includes("Route (app)"));
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

  exec(`pm2 restart ${PM2_NAME} --update-env`, { cwd: SITE_PATH }, (err) => {
    if (err) console.error("[admin/deploy] PM2 restart failed:", err.message);
  });

  return response;
}
