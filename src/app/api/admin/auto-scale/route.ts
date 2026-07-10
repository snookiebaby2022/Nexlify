import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { execSync } from "child_process";

type ScaleMetrics = {
  cpu: number;
  memory: number;
  connections: number;
  uptime: number;
};

function getServerMetrics(): ScaleMetrics {
  try {
    const cpuRaw = execSync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' 2>/dev/null || echo 0", { encoding: "utf8" }).trim();
    const memRaw = execSync("free | awk '/Mem:/ {printf \"%.0f\", $3/$2*100}' 2>/dev/null || echo 0", { encoding: "utf8" }).trim();
    return {
      cpu: parseFloat(cpuRaw) || 0,
      memory: parseFloat(memRaw) || 0,
      connections: 0,
      uptime: parseFloat(execSync("awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0", { encoding: "utf8" }).trim()) || 0,
    };
  } catch {
    return { cpu: 0, memory: 0, connections: 0, uptime: 0 };
  }
}

function getPM2Instances(): number {
  try {
    const raw = execSync("pm2 jlist 2>/dev/null", { encoding: "utf8" });
    const procs = JSON.parse(raw);
    return procs.filter((p: { name: string }) => p.name === "nexlify").length;
  } catch {
    return 0;
  }
}

function scalePM2(targetInstances: number): boolean {
  try {
    const current = getPM2Instances();
    if (targetInstances === current) return true;

    if (targetInstances > current) {
      // Scale up
      execSync(`PORT=80 pm2 scale nexlify ${targetInstances} 2>/dev/null`, { encoding: "utf8" });
    } else {
      // Scale down
      execSync(`pm2 scale nexlify ${targetInstances} 2>/dev/null`, { encoding: "utf8" });
    }
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const metrics = getServerMetrics();
  const instances = getPM2Instances();

  const server = await prisma.streamServer.findFirst({
    where: { isActive: true },
    select: {
      autoScaleEnabled: true,
      autoScaleMinInstances: true,
      autoScaleMaxInstances: true,
      autoScaleCpuThreshold: true,
      autoScaleCooldownSec: true,
    },
  });

  return NextResponse.json({
    metrics,
    instances,
    config: server ?? {
      autoScaleEnabled: false,
      autoScaleMinInstances: 1,
      autoScaleMaxInstances: 4,
      autoScaleCpuThreshold: 80,
      autoScaleCooldownSec: 300,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  if (body.action === "scale") {
    const target = Number(body.instances);
    if (!Number.isFinite(target) || target < 1 || target > 16) {
      return NextResponse.json({ error: "Invalid instance count (1-16)" }, { status: 400 });
    }
    const ok = scalePM2(target);
    return NextResponse.json({ ok, instances: getPM2Instances() });
  }

  if (body.action === "config") {
    const server = await prisma.streamServer.findFirst({ where: { isActive: true } });
    if (!server) return NextResponse.json({ error: "No server found" }, { status: 404 });

    await prisma.streamServer.update({
      where: { id: server.id },
      data: {
        autoScaleEnabled: body.enabled ?? false,
        autoScaleMinInstances: body.minInstances ?? 1,
        autoScaleMaxInstances: body.maxInstances ?? 4,
        autoScaleCpuThreshold: body.cpuThreshold ?? 80,
        autoScaleCooldownSec: body.cooldownSec ?? 300,
      },
    });

    return NextResponse.json({ ok: true });
  }

  if (body.action === "auto") {
    // Auto-scale based on current metrics
    const server = await prisma.streamServer.findFirst({ where: { isActive: true, autoScaleEnabled: true } });
    if (!server) return NextResponse.json({ ok: false, reason: "Auto-scaling not enabled" });

    const metrics = getServerMetrics();
    const current = getPM2Instances();
    const { autoScaleMinInstances, autoScaleMaxInstances, autoScaleCpuThreshold } = server;

    let target = current;

    if (metrics.cpu > autoScaleCpuThreshold && current < autoScaleMaxInstances) {
      target = Math.min(current + 1, autoScaleMaxInstances);
    } else if (metrics.cpu < autoScaleCpuThreshold * 0.5 && current > autoScaleMinInstances) {
      target = Math.max(current - 1, autoScaleMinInstances);
    }

    if (target !== current) {
      scalePM2(target);
      return NextResponse.json({ ok: true, action: target > current ? "scale-up" : "scale-down", from: current, to: target, cpu: metrics.cpu });
    }

    return NextResponse.json({ ok: true, action: "none", instances: current, cpu: metrics.cpu });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
