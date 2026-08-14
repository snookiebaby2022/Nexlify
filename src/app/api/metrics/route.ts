import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { secretsEqual } from "@/lib/secrets-equal";

export const dynamic = "force-dynamic";

/**
 * Prometheus-compatible metrics for 3rd-party monitoring (1-stream parity).
 * Enable under Admin → Settings → Monitoring, then scrape with Authorization: Bearer <token>.
 */
export async function GET(req: NextRequest) {
  const monitoring = await getSettingGroup("monitoring");
  if (monitoring.metricsExportEnabled !== true) {
    return NextResponse.json({ error: "Metrics export disabled" }, { status: 404 });
  }
  const token = String(monitoring.metricsExportToken ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: "Metrics token not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const q = req.nextUrl.searchParams.get("token") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!secretsEqual(bearer, token) && !secretsEqual(q, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [linesActive, linesTotal, streamsActive, streamsOffline, liveConnections, servers] =
    await Promise.all([
      prisma.line.count({ where: { status: "ACTIVE" } }),
      prisma.line.count(),
      prisma.stream.count({ where: { isActive: true } }),
      prisma.stream.count({ where: { isActive: true, lastProbeOk: false } }),
      prisma.liveConnection.count(),
      prisma.streamServer.findMany({
        select: { id: true, name: true, isActive: true, healthStatus: true, maxClients: true },
      }),
    ]);

  const lines: string[] = [
    "# HELP nexlify_lines_total Total lines",
    "# TYPE nexlify_lines_total gauge",
    `nexlify_lines_total ${linesTotal}`,
    "# HELP nexlify_lines_active Active lines",
    "# TYPE nexlify_lines_active gauge",
    `nexlify_lines_active ${linesActive}`,
    "# HELP nexlify_streams_active Active streams",
    "# TYPE nexlify_streams_active gauge",
    `nexlify_streams_active ${streamsActive}`,
    "# HELP nexlify_streams_probe_failed Active streams with failed last probe",
    "# TYPE nexlify_streams_probe_failed gauge",
    `nexlify_streams_probe_failed ${streamsOffline}`,
    "# HELP nexlify_live_connections Current live connections",
    "# TYPE nexlify_live_connections gauge",
    `nexlify_live_connections ${liveConnections}`,
    "# HELP nexlify_server_online Streaming server online (1/0)",
    "# TYPE nexlify_server_online gauge",
  ];
  for (const s of servers) {
    const name = s.name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const online = s.isActive && s.healthStatus !== "offline" && s.healthStatus !== "down" ? 1 : 0;
    lines.push(`nexlify_server_online{server_id="${s.id}",name="${name}"} ${online}`);
  }

  return new NextResponse(lines.join("\n") + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
