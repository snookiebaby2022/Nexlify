import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const packages = await prisma.package.findMany({
    where: { isActive: true, shopEnabled: true },
    orderBy: [{ sortOrder: "asc" }, { days: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      days: true,
      shopPriceCents: true,
      maxLines: true,
    },
  });
  return NextResponse.json({ packages });
}
