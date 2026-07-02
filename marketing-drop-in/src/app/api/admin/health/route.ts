import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { exec } from "child_process";
import { promisify } from "util";
import { readFileSync, existsSync } from "fs";

const execAsync = promisify(exec);

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

async function run(cmd: string): Promise<string> {
  try {
    const { stdout } = await execAsync(cmd, { timeout: 15000, maxBuffer: 1024 * 512 });
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [diskRaw, memRaw, uptimeRaw, loadRaw, pm2Raw, nodeRaw] = await Promise.all([
    run("df -h / | tail -1"),
    run("free -m | grep Mem"),
    run("uptime -p"),
    run("cat /proc/loadavg"),
    run("pm2 jlist 2>/dev/null"),
    run("node --version"),
  ]);

  let pm2Services: { name: string; status: string; pid: number; cpu: string; mem: string; uptime: number; restarts: number }[] = [];
  try {
    const apps = JSON.parse(pm2Raw);
    pm2Services = apps.map((a: any) => ({
      name: a.name,
      status: a.pm2_env?.status || "unknown",
      pid: a.pid,
      cpu: `${a.monit?.cpu || 0}%`,
      mem: `${Math.round((a.monit?.memory || 0) / 1024 / 1024)}MB`,
      uptime: a.pm2_env?.pm_uptime || 0,
      restarts: a.pm2_env?.restart_time || 0,
    }));
  } catch {}

  let disk = { total: "", used: "", avail: "", pct: "" };
  if (diskRaw) {
    const parts = diskRaw.split(/\s+/);
    disk = { total: parts[1] || "", used: parts[2] || "", avail: parts[3] || "", pct: parts[4] || "" };
  }

  let memory = { total: 0, used: 0, free: 0, pct: "" };
  if (memRaw) {
    const parts = memRaw.split(/\s+/);
    const total = parseInt(parts[1]) || 0;
    const used = parseInt(parts[2]) || 0;
    memory = { total, used, free: parseInt(parts[3]) || 0, pct: total ? `${Math.round((used / total) * 100)}%` : "" };
  }

  let load = "";
  if (loadRaw) {
    const parts = loadRaw.split(/\s+/);
    load = `${parts[0]} ${parts[1]} ${parts[2]}`;
  }

  let sslExpiry = "";
  const certPath = "/etc/letsencrypt/live/nexlify.live/fullchain.pem";
  if (existsSync(certPath)) {
    const expiryRaw = await run(`openssl x509 -in ${certPath} -enddate -noout 2>/dev/null`);
    if (expiryRaw) {
      const date = expiryRaw.replace("notAfter=", "");
      const d = new Date(date);
      const daysLeft = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      sslExpiry = `${d.toLocaleDateString()} (${daysLeft} days)`;
    }
  }

  let dbSize = "";
  const dbSizeRaw = await run("du -sh data/*.db 2>/dev/null || du -sh *.db 2>/dev/null");
  if (dbSizeRaw) dbSize = dbSizeRaw.split(/\s+/)[0] || "";

  return NextResponse.json({
    disk,
    memory,
    uptime: uptimeRaw.replace("up ", ""),
    load,
    sslExpiry,
    dbSize,
    nodeVersion: nodeRaw,
    pm2Services,
  });
}
