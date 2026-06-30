import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const panels = await prisma.panelInstance.findMany({
      orderBy: { lastSeenAt: "desc" },
    });
    return NextResponse.json({ panels });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await prisma.panelInstance.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string;
      autoUpdateEnabled?: boolean;
      isActive?: boolean;
    };
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const data: any = {};
    if (typeof body.autoUpdateEnabled === "boolean") data.autoUpdateEnabled = body.autoUpdateEnabled;
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    const updated = await prisma.panelInstance.update({ where: { id: body.id }, data });
    return NextResponse.json({ ok: true, panel: updated });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
