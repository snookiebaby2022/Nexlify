import { NextResponse } from "next/server";
import { getAdminStats } from "@/lib/admin-stats";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const stats = await getAdminStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[admin/stats]", error);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
