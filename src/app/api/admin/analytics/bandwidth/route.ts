import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: Request) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "7", 10);

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const snapshots = await prisma.bandwidthSnapshot.findMany({
    where: { createdAt: { gte: cutoff } },
    orderBy: { createdAt: "asc" },
    select: { bytesOut: true, createdAt: true },
  });

  const dailyMap: Record<string, number> = {};
  for (const s of snapshots) {
    const day = s.createdAt.toISOString().split("T")[0];
    dailyMap[day] = (dailyMap[day] ?? 0) + Number(s.bytesOut);
  }

  const labels: string[] = [];
  const values: number[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split("T")[0];
    labels.push(key);
    values.push(Math.round((dailyMap[key] ?? 0) / 1_000_000_000));
  }

  return NextResponse.json({ labels, values, unit: "GB" });
}
