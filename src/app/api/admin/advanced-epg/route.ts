import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  createEpgSource,
  getEpgSources,
  deleteEpgSource,
  syncEpgSource,
} from "@/lib/advanced-epg";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sources = await getEpgSources();
  return NextResponse.json({ sources });
}

export async function POST(req: Request) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action, name, url, format, sourceId } = await req.json();

  if (action === "create") {
    const source = await createEpgSource(name, url, format);
    return NextResponse.json(source);
  }

  if (action === "delete") {
    await deleteEpgSource(sourceId);
    return NextResponse.json({ ok: true });
  }

  if (action === "sync") {
    await syncEpgSource(sourceId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
