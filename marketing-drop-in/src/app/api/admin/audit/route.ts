import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function GET(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "50")));
  const action = searchParams.get("action") || undefined;

  const where = action ? { action } : {};

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({ rows, total, page, limit });
}
