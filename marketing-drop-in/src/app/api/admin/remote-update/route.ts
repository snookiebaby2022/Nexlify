import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
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
  const { panelUrls, force, secret } = body as {
    panelUrls?: string[];
    force?: boolean;
    secret?: string;
  };

  if (!Array.isArray(panelUrls) || panelUrls.length === 0) {
    return NextResponse.json({ error: "panelUrls required" }, { status: 400 });
  }

  const override = typeof secret === "string" ? secret.trim() : "";
  const results = [];
  for (const rawUrl of panelUrls) {
    results.push(
      await triggerPanelRemoteUpdate({
        panelUrl: String(rawUrl),
        apiKey: override || undefined,
        force: force === true,
      }),
    );
  }

  await logAudit({
    email: user.email,
    action: "remote_update_trigger",
    detail: `${results.length} panels`,
  });

  return NextResponse.json({ results });
}
