import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import fs from "fs";
import path from "path";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const zipPath = path.join(process.cwd(), "dist", "nexlify-whmcs-module.zip");
  if (!fs.existsSync(zipPath)) {
    return NextResponse.json(
      {
        error: "ZIP not built. Run: npm run package:whmcs",
        path: "dist/nexlify-whmcs-module.zip",
      },
      { status: 404 }
    );
  }

  const buf = fs.readFileSync(zipPath);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="nexlify-whmcs-module.zip"',
    },
  });
}
