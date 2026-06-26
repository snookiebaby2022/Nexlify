import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const licenses = await prisma.license.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { email: true, name: true } },
      plan: { select: { name: true, slug: true } },
      order: { select: { couponCode: true, amountCents: true, status: true } },
    },
  });

  const header = [
    "id",
    "key",
    "email",
    "plan",
    "status",
    "expiresAt",
    "maxLines",
    "machineId",
    "notes",
    "couponCode",
    "amountCents",
    "createdAt",
  ].join(",");

  const rows = licenses.map((l) =>
    [
      csvEscape(l.id),
      csvEscape(l.key),
      csvEscape(l.user.email),
      csvEscape(l.plan.name),
      csvEscape(l.status),
      csvEscape(l.expiresAt ? formatDate(l.expiresAt) : ""),
      csvEscape(l.maxLines),
      csvEscape(l.machineId),
      csvEscape(l.notes),
      csvEscape(l.order?.couponCode),
      csvEscape(l.order?.amountCents),
      csvEscape(formatDate(l.createdAt)),
    ].join(","),
  );

  const csv = [header, ...rows].join("\n");
  const filename = `nexlify-licenses-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
