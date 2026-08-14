import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { triggerPanelRemoteUpdate } from "@/lib/trigger-panel-update";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { force, secret } = body as { force?: boolean; secret?: string };
  const override = typeof secret === "string" ? secret.trim() : "";

  const licenses = await prisma.license.findMany({
    where: { panelUrl: { not: null } },
    select: { panelUrl: true },
    distinct: ["panelUrl"],
  });

  const panelUrls = licenses
    .map((l) => l.panelUrl)
    .filter((u): u is string => Boolean(u));

  if (!panelUrls.length) {
    return NextResponse.json({ error: "No panels with panelUrl found" }, { status: 404 });
  }

  const results = [];
  for (const url of panelUrls) {
    results.push(
      await triggerPanelRemoteUpdate({
        panelUrl: url,
        apiKey: override || undefined,
        force: force === true,
      }),
    );
  }

  await logAudit({
    email: user.email,
    action: "remote_update_broadcast",
    detail: `${results.length} panels`,
  });

  return NextResponse.json({ results });
}
