import os from "os";
import { prisma } from "@/lib/prisma";
import { listActiveConnections } from "@/lib/connections";
import { getDashboardServerMetrics } from "@/lib/dashboard-server-metrics";
import { readInstalledVersion } from "@/lib/panel-version";
import { getPanelServerSettings } from "@/lib/panel-server";
import { PanelRole, StreamType } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";

export type PanelReportInput = {
  session: SessionUser;
  host: string;
  page?: string;
  note?: string;
  clientIp?: string;
  attachmentCount?: number;
};

export async function buildPanelReport(input: PanelReportInput): Promise<{ subject: string; text: string }> {
  const now = new Date();
  const repoPath = process.cwd();
  const { version } = await readInstalledVersion(repoPath);
  const server = await getPanelServerSettings();

  const [
    lines,
    activeLines,
    liveStreams,
    movies,
    series,
    bouquets,
    resellers,
    magDevices,
    tickets,
    connections,
    servers,
    recentLogs,
  ] = await Promise.all([
    prisma.line.count(),
    prisma.line.count({ where: { status: "ACTIVE", expiresAt: { gt: now } } }),
    prisma.stream.count({ where: { type: StreamType.LIVE, isActive: true } }),
    prisma.stream.count({ where: { type: StreamType.MOVIE, isActive: true } }),
    prisma.stream.count({ where: { type: StreamType.SERIES, isActive: true } }),
    prisma.bouquet.count(),
    prisma.panelUser.count({ where: { role: { in: [PanelRole.RESELLER, PanelRole.SUB_RESELLER] } } }),
    prisma.magDevice.count({ where: { isActive: true } }),
    prisma.ticket.count(),
    listActiveConnections(),
    getDashboardServerMetrics(),
    prisma.activityLog.findMany({ take: 10, orderBy: { createdAt: "desc" } }),
  ]);

  const onlineServers = servers.filter((s) => s.online).length;
  const panelUrl = input.host.includes("://") ? input.host : `https://${input.host}`;
  const note = input.note?.trim();
  const attachmentCount = input.attachmentCount ?? 0;

  const lines_out = [
    "Nexlify Panel Report",
    "====================",
    "",
    `Time:        ${now.toISOString()}`,
    `Panel:       ${panelUrl}`,
    `Version:     v${version}`,
    `Reported by: ${input.session.username} (${input.session.role})`,
    `Page:        ${input.page || "/"}`,
    `Client IP:   ${input.clientIp || "unknown"}`,
    `Hostname:    ${os.hostname()}`,
    `Platform:    ${process.platform} · Node ${process.version}`,
    "",
  ];

  if (attachmentCount > 0) {
    lines_out.push(
      `Screenshots: ${attachmentCount} image${attachmentCount === 1 ? "" : "s"} attached to this email`,
      ""
    );
  }

  lines_out.push(
    "Summary",
    "-------",
    `Lines:              ${lines} (${activeLines} active)`,
    `Live streams:       ${liveStreams}`,
    `Movies / Series:    ${movies} / ${series}`,
    `Bouquets:           ${bouquets}`,
    `Resellers:          ${resellers}`,
    `MAG devices:        ${magDevices}`,
    `Open tickets:       ${tickets}`,
    `Live connections:   ${connections.length}`,
    `Streaming servers:  ${servers.length} (${onlineServers} online)`,
    `Repo path:          ${server.repoPath || repoPath}`,
    ""
  );

  if (servers.length > 0) {
    lines_out.push("Servers", "-------");
    for (const s of servers.slice(0, 12)) {
      lines_out.push(
        `- ${s.name} (${s.host}) — ${s.online ? "online" : "offline"} · CPU ${s.cpu}% · RAM ${s.memory}%`
      );
    }
    lines_out.push("");
  }

  if (recentLogs.length > 0) {
    lines_out.push("Recent activity", "---------------");
    for (const log of recentLogs) {
      lines_out.push(`- ${log.createdAt.toISOString()} · ${log.action} · ${log.entity ?? ""}`);
    }
    lines_out.push("");
  }

  if (note) {
    lines_out.push("Issue description", "-----------------", note, "");
  }

  lines_out.push("— Sent from Nexlify panel sidebar Report");

  const subject = `Nexlify panel report · v${version} · ${input.session.username} @ ${input.host}`;

  return { subject, text: lines_out.join("\n") };
}
