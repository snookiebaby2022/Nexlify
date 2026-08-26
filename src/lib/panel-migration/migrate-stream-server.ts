import { prisma } from "@/lib/prisma";
import { isLocalPanelHost } from "@/lib/panel-local-server";

export function streamServerUsableForPlayback(s: {
  isActive: boolean;
  host: string;
  healthStatus: string | null;
  agentToken?: string | null;
}): boolean {
  if (!s.isActive) return false;
  if (isLocalPanelHost(s.host)) return true;
  if (s.agentToken) return true;
  const h = String(s.healthStatus ?? "").toLowerCase();
  return h === "online" || h === "healthy";
}

export async function usableMigrateStreamServerIds(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (!unique.length) return new Set();
  const rows = await prisma.streamServer.findMany({
    where: { id: { in: unique } },
    select: { id: true, host: true, isActive: true, healthStatus: true, agentToken: true },
  });
  return new Set(rows.filter(streamServerUsableForPlayback).map((s) => s.id));
}

export function pickMigrateStreamServerId(
  mapped: string | undefined,
  usable: Set<string>,
  fallback: string | undefined
): string | undefined {
  if (mapped && usable.has(mapped)) return mapped;
  if (fallback && usable.has(fallback)) return fallback;
  return undefined;
}
