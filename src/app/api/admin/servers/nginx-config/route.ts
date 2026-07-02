import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { buildStreamServerNginxConfig } from "@/lib/nginx-stream-server-config";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const panelUrl = req.nextUrl.searchParams.get("panelUrl") ?? undefined;
  const config = await buildStreamServerNginxConfig(panelUrl ?? undefined);
  const download = req.nextUrl.searchParams.get("download") === "1";

  if (download) {
    return new NextResponse(config, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": 'attachment; filename="nexlify-stream-nginx.conf"',
      },
    });
  }

  return NextResponse.json({ config });
}
