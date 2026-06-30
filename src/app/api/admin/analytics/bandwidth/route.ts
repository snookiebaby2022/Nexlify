import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
