import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const secret =
    process.env.PANEL_INTERNAL_SECRET?.trim() ??
    process.env.NEXLIFY_PANEL_API_SECRET?.trim() ??
    process.env.PANEL_API_SECRET?.trim();

  const provided =
    req.headers.get("x-panel-internal-secret") ??
    req.headers.get("x-panel-api-key");

  if (!secret || provided !== secret) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const body = (await req.json()) as { action?: string; version?: string };

    if (body.action === "update") {
      const { startBackgroundPanelUpdate } = await import("@/lib/panel-update-job");
      const { getResolvedRepoPath } = await import("@/lib/panel-server");
      const { getPanelServerSettings } = await import("@/lib/panel-server");
      const { readInstalledVersion } = await import("@/lib/panel-version");

      const server = await getPanelServerSettings();
      const repoPath = getResolvedRepoPath(server);
      const { version: fromVersion } = await readInstalledVersion(repoPath);

      const result = await startBackgroundPanelUpdate(repoPath, fromVersion);

      if (result.ok) {
        return Response.json({ ok: true, started: true, fromVersion });
      } else {
        return Response.json({ ok: false, error: result.error || "Could not start update" }, { status: 409 });
      }
    }

    return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("[panel-webhook] error:", e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
