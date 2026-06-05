import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  importPanelTransfer,
  previewPanelTransfer,
} from "@/lib/panel-transfer-import";

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const bundle = body.bundle ?? body;
  const dryRun = Boolean(body.dryRun);

  const options = {
    dryRun,
    importBouquets: body.importBouquets !== false,
    importStreams: body.importStreams !== false,
    importLines: body.importLines !== false,
    importResellers: Boolean(body.importResellers),
    importProviders: body.importProviders !== false,
    skipExistingLines: body.skipExistingLines !== false,
    skipExistingStreams: body.skipExistingStreams !== false,
    skipExistingResellers: body.skipExistingResellers !== false,
    defaultServerId: (body.defaultServerId as string) ?? null,
  };

  try {
    const preview = previewPanelTransfer(bundle);
    if (dryRun) {
      return NextResponse.json({ preview, result: null });
    }
    const result = await importPanelTransfer(bundle, options);
    return NextResponse.json({ preview, result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
