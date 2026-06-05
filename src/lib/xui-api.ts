import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { hashPassword } from "./auth";
import { logActivity } from "./lines";
import { listActiveConnections } from "./connections";
import { dispatchOutboundWebhook } from "./outbound-webhooks";
import { PanelRole, Prisma, StreamType } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";

export async function authenticateAdminApi(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const apiKey = params.get("api_key");
  const accessCode = params.get("access_code");
  if (!apiKey) return null;

  const hmacSig = req.headers.get("x-nexlify-signature") ?? params.get("hmac");
  const hmacKey = await prisma.panelSetting.findUnique({ where: { key: "hmac_api_secret" } });

  if (hmacSig && hmacKey?.value) {
    const payload = params.toString();
    const expected = createHmac("sha256", hmacKey.value).update(payload).digest("hex");
    try {
      if (
        hmacSig.length === expected.length &&
        timingSafeEqual(Buffer.from(hmacSig), Buffer.from(expected))
      ) {
        const user = await prisma.panelUser.findFirst({
          where: { role: PanelRole.ADMIN, isActive: true },
        });
        return user;
      }
    } catch {
      /* fall through */
    }
  }

  const user = await prisma.panelUser.findFirst({
    where: {
      apiKey,
      role: PanelRole.ADMIN,
      isActive: true,
      ...(accessCode ? { accessCode } : {}),
    },
  });
  return user;
}

export async function handleXuiAction(
  action: string,
  params: URLSearchParams,
  adminId: string
) {
  switch (action) {
    case "get_bouquets": {
      const bouquets = await prisma.bouquet.findMany({
        include: { streams: { include: { stream: true } } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
      return { status: "success", bouquets };
    }

    case "get_users": {
      const users = await prisma.panelUser.findMany({
        select: {
          id: true,
          username: true,
          role: true,
          credits: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return { status: "success", users };
    }

    case "get_lines": {
      const lines = await prisma.line.findMany({
        include: { bouquets: { include: { bouquet: true } } },
        orderBy: { createdAt: "desc" },
      });
      return { status: "success", lines };
    }

    case "get_line": {
      const id = params.get("id");
      if (!id) return { status: "error", message: "id required" };
      const line = await prisma.line.findUnique({
        where: { id },
        include: { bouquets: true },
      });
      if (!line) return { status: "error", message: "not found" };
      return { status: "success", line };
    }

    case "get_streams": {
      const type = params.get("type");
      const where: Prisma.StreamWhereInput = {};
      if (type) where.type = type as StreamType;
      const streams = await prisma.stream.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        take: Math.min(5000, parseInt(params.get("limit") ?? "2000", 10)),
      });
      return { status: "success", streams };
    }

    case "get_movies": {
      const movies = await prisma.stream.findMany({
        where: { type: StreamType.MOVIE },
        orderBy: { name: "asc" },
        take: Math.min(5000, parseInt(params.get("limit") ?? "2000", 10)),
      });
      return { status: "success", movies };
    }

    case "get_series": {
      const series = await prisma.stream.findMany({
        where: { type: StreamType.SERIES },
        orderBy: [{ seriesName: "asc" }, { seasonNum: "asc" }, { episodeNum: "asc" }],
        take: Math.min(5000, parseInt(params.get("limit") ?? "2000", 10)),
      });
      return { status: "success", series };
    }

    case "get_mag": {
      const devices = await prisma.magDevice.findMany({
        include: { line: { select: { username: true } } },
        orderBy: { createdAt: "desc" },
      });
      return { status: "success", mag_devices: devices };
    }

    case "live_connections": {
      const connections = await listActiveConnections();
      return { status: "success", connections };
    }

    case "activity_logs": {
      const take = Math.min(500, parseInt(params.get("limit") ?? "100", 10));
      const logs = await prisma.activityLog.findMany({
        take,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { username: true } },
          line: { select: { username: true } },
        },
      });
      return { status: "success", logs };
    }

    case "get_access_codes": {
      const codes = await prisma.accessCode.findMany({ orderBy: { createdAt: "desc" } });
      return { status: "success", access_codes: codes };
    }

    case "get_analytics": {
      const topChannels = await prisma.lineChannelWatch.findMany({
        orderBy: { watchCount: "desc" },
        take: 20,
        include: { stream: { select: { id: true, name: true, type: true } } },
      });
      const connections = await listActiveConnections();
      return {
        status: "success",
        online_connections: connections.length,
        top_channels: topChannels.map((r) => ({
          streamId: r.streamId,
          name: r.stream.name,
          type: r.stream.type,
          watchCount: r.watchCount,
          lastWatchedAt: r.lastWatchedAt,
        })),
      };
    }

    case "create_line": {
      const username = params.get("username");
      const password = params.get("password") ?? generatePassword();
      const maxConnections = parseInt(params.get("max_connections") ?? "1", 10);
      const days = parseInt(params.get("days") ?? "30", 10);
      const bouquetIds = params.getAll("bouquet[]").length
        ? params.getAll("bouquet[]")
        : (params.get("bouquets")?.split(",") ?? []);
      const authMode = params.get("auth_mode") === "active_code" ? "ACTIVE_CODE" : "USERNAME_PASSWORD";
      const activeCode = params.get("active_code")?.trim().toUpperCase() || null;

      if (!username && authMode !== "ACTIVE_CODE") {
        return { status: "error", message: "username required" };
      }
      if (authMode === "ACTIVE_CODE" && !activeCode) {
        return { status: "error", message: "active_code required" };
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);

      const line = await prisma.line.create({
        data: {
          username: username ?? activeCode!,
          password: authMode === "ACTIVE_CODE" ? (password || activeCode!) : password,
          maxConnections,
          expiresAt,
          authMode,
          activeCode: authMode === "ACTIVE_CODE" ? activeCode : null,
          bouquets: {
            create: bouquetIds.map((bouquetId) => ({ bouquetId })),
          },
        },
        include: { bouquets: true },
      });

      await logActivity("api_create_line", {
        userId: adminId,
        lineId: line.id,
        entity: "line",
        entityId: line.id,
      });
      void dispatchOutboundWebhook("line.created", { lineId: line.id, username: line.username });

      return { status: "success", line, password };
    }

    case "edit_line": {
      const id = params.get("id");
      if (!id) return { status: "error", message: "id required" };
      const data: Prisma.LineUpdateInput = {};
      if (params.get("password")) data.password = params.get("password")!;
      if (params.get("max_connections"))
        data.maxConnections = parseInt(params.get("max_connections")!, 10);
      if (params.get("days")) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(params.get("days")!, 10));
        data.expiresAt = expiresAt;
      }
      if (params.get("auth_mode") === "active_code") data.authMode = "ACTIVE_CODE";
      if (params.get("active_code")) data.activeCode = params.get("active_code")!.trim().toUpperCase();
      const line = await prisma.line.update({
        where: { id },
        data,
        include: { bouquets: true },
      });
      await logActivity("api_edit_line", { userId: adminId, lineId: line.id });
      void dispatchOutboundWebhook("line.updated", { lineId: line.id });
      return { status: "success", line };
    }

    case "disable_line":
      return setLineStatus(params.get("id"), "DISABLED", adminId, "line.disabled");
    case "enable_line":
      return setLineStatus(params.get("id"), "ACTIVE", adminId, "line.enabled");
    case "ban_line":
      return setLineStatus(params.get("id"), "BANNED", adminId, "line.banned");
    case "unban_line":
      return setLineStatus(params.get("id"), "ACTIVE", adminId, "line.enabled");

    case "delete_line": {
      const id = params.get("id");
      if (!id) return { status: "error", message: "id required" };
      await prisma.line.delete({ where: { id } });
      await logActivity("api_delete_line", { userId: adminId, entityId: id });
      void dispatchOutboundWebhook("line.deleted", { lineId: id });
      return { status: "success" };
    }

    case "create_reseller": {
      const username = params.get("username");
      const password = params.get("password") ?? generatePassword();
      const credits = parseInt(params.get("credits") ?? "0", 10);
      if (!username) return { status: "error", message: "username required" };

      const reseller = await prisma.panelUser.create({
        data: {
          username,
          passwordHash: await hashPassword(password),
          role: PanelRole.RESELLER,
          credits,
          parentId: adminId,
        },
      });
      return { status: "success", reseller: { id: reseller.id, username }, password };
    }

    default:
      return { status: "error", message: `unknown action: ${action}` };
  }
}

async function setLineStatus(
  id: string | null,
  status: "ACTIVE" | "DISABLED" | "BANNED",
  adminId: string,
  webhookEvent: string
) {
  if (!id) return { status: "error", message: "id required" };
  const line = await prisma.line.update({
    where: { id },
    data: { status },
  });
  await logActivity(`api_${status.toLowerCase()}_line`, {
    userId: adminId,
    lineId: line.id,
  });
  void dispatchOutboundWebhook(webhookEvent, { lineId: line.id, status });
  return { status: "success", line };
}

function generatePassword() {
  return Math.random().toString(36).slice(2, 10);
}
