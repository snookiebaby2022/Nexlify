import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { buildPanelTransferExport } from "@/lib/panel-transfer-export";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sections = req.nextUrl.searchParams.get("sections");
  const download = req.nextUrl.searchParams.get("download") === "1";

  try {
    const bundle = await buildPanelTransferExport(sections);
    if (download) {
      const filename = `nexlify-transfer-${new Date().toISOString().slice(0, 10)}.json`;
      return new NextResponse(JSON.stringify(bundle, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }
    return NextResponse.json({ bundle, preview: {
      bouquets: bundle.bouquets.length,
      streams: bundle.streams.length,
      lines: bundle.lines.length,
      resellers: bundle.resellers.length,
      providers: bundle.providers.length,
    }});
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
