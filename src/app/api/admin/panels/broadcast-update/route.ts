import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const panels = await prisma.panelInstance.findMany({
      where: { isActive: true, autoUpdateEnabled: true },
      orderBy: { lastSeenAt: "desc" },
    });

    const results: any[] = [];
    for (const panel of panels) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(`${panel.url}/api/internal/panel-update`, {
          method: "POST",
          headers: {
            "x-panel-internal-secret": panel.secret,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = await res.json().catch(() => ({ ok: false }));
        results.push({ url: panel.url, ok: res.ok, started: data.started, reason: data.reason });
        if (res.ok) {
          await prisma.panelInstance.update({ where: { id: panel.id }, data: { lastSeenAt: new Date(), lastError: null } });
        } else {
          await prisma.panelInstance.update({ where: { id: panel.id }, data: { lastError: `HTTP ${res.status}` } });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ url: panel.url, ok: false, error: msg });
        await prisma.panelInstance.update({ where: { id: panel.id }, data: { lastError: msg } });
      }
    }

    const success = results.filter((r) => r.ok).length;
    return NextResponse.json({ ok: true, total: panels.length, success, failed: results.length - success, results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
