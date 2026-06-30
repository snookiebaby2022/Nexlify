import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lineStatus = String(searchParams.get("lineStatus") ?? "").trim().toUpperCase();
  const language = String(searchParams.get("language") ?? "en").trim();

  const statusMap: Record<string, string> = {
    ACTIVE: "generic",
    EXPIRED: "expired",
    DISABLED: "suspended",
    BANNED: "suspended",
  };

  const type = statusMap[lineStatus] ?? "generic";

  const video = await prisma.expiryVideo.findFirst({
    where: {
      type,
      language,
      isActive: true,
    },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
  });

  if (!video) {
    return NextResponse.json({ error: "No video configured for this status" }, { status: 404 });
  }

  return NextResponse.json({ video });
}
