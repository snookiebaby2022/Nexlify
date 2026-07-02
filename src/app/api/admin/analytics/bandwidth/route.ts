import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";

export async function GET(req: Request) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "7", 10);

  // Mock bandwidth data; replace with real connection log aggregation
  const labels = [];
  const values = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    labels.push(d.toISOString().split("T")[0]);
    values.push(Math.round(500 + Math.random() * 1500));
  }

  return NextResponse.json({ labels, values, unit: "GB" });
}
