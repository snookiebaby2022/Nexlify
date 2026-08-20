import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { invalidateXtreamCategories } from "@/lib/cache-invalidate";
import { PanelRole } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";

function parseSpeedInput(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}

function parseBouquetIds(body: Record<string, unknown>): string[] {
  const raw = body.bouquetIds ?? body.bouquetId;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;

    const body = parsed.data as Record<string, unknown>;
    const ids: string[] = (body.ids as string[]) ?? [];
    if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });

    const action = body.action as string;

    if (action === "enable") {
      await prisma.stream.updateMany({ where: { id: { in: ids } }, data: { isActive: true } });
    } else if (action === "disable") {
      await prisma.stream.updateMany({ where: { id: { in: ids } }, data: { isActive: false } });
    } else if (action === "delete") {
      await prisma.stream.deleteMany({ where: { id: { in: ids } } });
    } else if (action === "setCategory" && body.categoryId !== undefined) {
      await prisma.stream.updateMany({
        where: { id: { in: ids } },
        data: { categoryId: body.categoryId ? String(body.categoryId) : null },
      });
      await invalidateXtreamCategories();
    } else if (action === "clearCategory") {
      await prisma.stream.updateMany({
        where: { id: { in: ids } },
        data: { categoryId: null },
      });
      await invalidateXtreamCategories();
    } else if (action === "setServer" && body.serverId !== undefined) {
      await prisma.stream.updateMany({
        where: { id: { in: ids } },
        data: { serverId: body.serverId ? String(body.serverId) : null },
      });
    } else if (action === "setAdult" && body.isAdult !== undefined) {
      await prisma.stream.updateMany({
        where: { id: { in: ids } },
        data: { isAdult: Boolean(body.isAdult) },
      });
    } else if (action === "setContainerExtension" && body.containerExtension !== undefined) {
      const ext = body.containerExtension ? String(body.containerExtension).replace(/^\./, "") : "mp4";
      await prisma.stream.updateMany({
        where: { id: { in: ids } },
        data: { containerExtension: ext || "mp4" },
      });
    } else if (action === "setSeriesName" && body.seriesName !== undefined) {
      await prisma.stream.updateMany({
        where: { id: { in: ids } },
        data: { seriesName: body.seriesName ? String(body.seriesName).trim() : null },
      });
    } else if (action === "addToBouquet") {
      const bouquetIds = parseBouquetIds(body);
      if (!bouquetIds.length) {
        return NextResponse.json({ error: "bouquetIds required" }, { status: 400 });
      }
      const existing = await prisma.bouquetStream.findMany({
        where: { streamId: { in: ids }, bouquetId: { in: bouquetIds } },
        select: { streamId: true, bouquetId: true },
      });
      const have = new Set(existing.map((r) => `${r.streamId}:${r.bouquetId}`));
      const data = ids.flatMap((streamId) =>
        bouquetIds
          .filter((bouquetId) => !have.has(`${streamId}:${bouquetId}`))
          .map((bouquetId) => ({ streamId, bouquetId, sortOrder: 0 }))
      );
      if (data.length) {
        await prisma.bouquetStream.createMany({ data, skipDuplicates: true });
      }
    } else if (action === "removeFromBouquet") {
      const bouquetIds = parseBouquetIds(body);
      if (!bouquetIds.length) {
        return NextResponse.json({ error: "bouquetIds required" }, { status: 400 });
      }
      await prisma.bouquetStream.deleteMany({
        where: { streamId: { in: ids }, bouquetId: { in: bouquetIds } },
      });
    } else if (action === "setVodMode" && body.vodMode !== undefined) {
      const mode = String(body.vodMode);
      if (!["LIVE", "ON_DEMAND", "CATCHUP"].includes(mode)) {
        return NextResponse.json({ error: "Invalid vodMode" }, { status: 400 });
      }
      await prisma.stream.updateMany({
        where: { id: { in: ids } },
        data: {
          vodMode: mode as "LIVE" | "ON_DEMAND" | "CATCHUP",
          isOnDemand: mode !== "LIVE",
          archiveDays:
            body.archiveDays !== undefined && body.archiveDays !== ""
              ? Number(body.archiveDays)
              : undefined,
        },
      });
    } else if (action === "setSpeed") {
      const minSpeedKbps = parseSpeedInput(body.minSpeedKbps);
      const maxSpeedKbps = parseSpeedInput(body.maxSpeedKbps);
      if (minSpeedKbps === undefined && maxSpeedKbps === undefined) {
        return NextResponse.json({ error: "Provide min and/or max speed (Kbps)" }, { status: 400 });
      }
      if (minSpeedKbps != null && maxSpeedKbps != null && minSpeedKbps > maxSpeedKbps) {
        return NextResponse.json(
          { error: "Min speed cannot be greater than max speed" },
          { status: 400 }
        );
      }
      const data: { minSpeedKbps?: number | null; maxSpeedKbps?: number | null } = {};
      if (minSpeedKbps !== undefined) data.minSpeedKbps = minSpeedKbps;
      if (maxSpeedKbps !== undefined) data.maxSpeedKbps = maxSpeedKbps;

      const existing = await prisma.stream.findMany({
        where: { id: { in: ids } },
        select: { minSpeedKbps: true, maxSpeedKbps: true },
      });
      for (const row of existing) {
        const nextMin = data.minSpeedKbps !== undefined ? data.minSpeedKbps : row.minSpeedKbps;
        const nextMax = data.maxSpeedKbps !== undefined ? data.maxSpeedKbps : row.maxSpeedKbps;
        if (nextMin != null && nextMax != null && nextMin > nextMax) {
          return NextResponse.json(
            { error: "Min speed cannot be greater than max speed for selected streams" },
            { status: 400 }
          );
        }
      }

      await prisma.stream.updateMany({ where: { id: { in: ids } }, data });
      await logActivity("mass_streams", {
        userId: session.id,
        entity: "stream",
        meta: { action: "setSpeed", count: ids.length, minSpeedKbps, maxSpeedKbps },
      });
    } else if (action === "setBackupUrl") {
      const backupUrl =
        body.backupUrl === null || body.backupUrl === ""
          ? null
          : String(body.backupUrl).trim() || null;
      await prisma.stream.updateMany({
        where: { id: { in: ids } },
        data: { backupUrl },
      });
    } else if (action === "clearBackupUrl") {
      await prisma.stream.updateMany({
        where: { id: { in: ids } },
        data: { backupUrl: null },
      });
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    if (action !== "setSpeed") {
      await logActivity("mass_streams", {
        userId: session.id,
        entity: "stream",
        meta: { action, count: ids.length },
      });
    }

    return NextResponse.json({ ok: true, count: ids.length });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
