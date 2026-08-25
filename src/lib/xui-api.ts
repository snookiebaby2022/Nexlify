import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { hashPassword } from "./auth";
import { logActivity } from "./lines";
import { listActiveConnections } from "./connections";
import { dispatchOutboundWebhook } from "./outbound-webhooks";
import { PanelRole, Prisma, StreamType } from "@prisma/client";
import { handleXuiExtendedAction } from "./xui-api-extended";
import {
  generatePassword,
  hmacHex,
  hmacHexEqual,
  hmacPayloadFromSearchParams,
  parseBoundedInt,
  parseStreamType,
} from "./xui-api-utils";
import { hasPermission, PERMS } from "./staff-permissions";
import { validateLineCredential } from "./credential-generate";

export async function authenticateAdminApi(req: NextRequest, params?: URLSearchParams) {
  const p = params ?? req.nextUrl.searchParams;
  const apiKey = p.get("api_key") ?? req.headers.get("x-api-key");
  const accessCode = p.get("access_code");
  if (!apiKey) return null;

  const hmacSig = req.headers.get("x-nexlify-signature") ?? p.get("hmac");
  const hmacKey = await prisma.panelSetting.findUnique({ where: { key: "hmac_api_secret" } });

  if (hmacSig && hmacKey?.value) {
    const expected = hmacHex(hmacKey.value, hmacPayloadFromSearchParams(p));
    if (!hmacHexEqual(hmacSig, expected)) return null;
  }

  const user = await prisma.panelUser.findFirst({
    where: {
      apiKey,
      isActive: true,
      ...(accessCode ? { accessCode } : {}),
      OR: [
        { role: PanelRole.ADMIN },
        { role: PanelRole.STAFF, permissions: { has: PERMS.API_ACCESS } },
      ],
    },
  });
  if (user && user.role === PanelRole.STAFF && !hasPermission(user, PERMS.API_ACCESS)) return null;
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
      const take = parseBoundedInt(params.get("limit"), 500, 1, 1000);
      const users = await prisma.panelUser.findMany({
        take,
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
      const take = parseBoundedInt(params.get("limit"), 1000, 1, 5000);
      const lines = await prisma.line.findMany({
        take,
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
      const type = parseStreamType(params.get("type"));
      const where: Prisma.StreamWhereInput = {};
      if (type) where.type = type;
      const streams = await prisma.stream.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        take: parseBoundedInt(params.get("limit"), 2000, 1, 5000),
      });
      return { status: "success", streams };
    }

    case "get_movies": {
      const movies = await prisma.stream.findMany({
        where: { type: StreamType.MOVIE },
        orderBy: { name: "asc" },
        take: parseBoundedInt(params.get("limit"), 2000, 1, 5000),
      });
      return { status: "success", movies };
    }

    case "get_series": {
      const series = await prisma.stream.findMany({
        where: { type: StreamType.SERIES },
        orderBy: [{ seriesName: "asc" }, { seasonNum: "asc" }, { episodeNum: "asc" }],
        take: parseBoundedInt(params.get("limit"), 2000, 1, 5000),
      });
      return { status: "success", series };
    }

    case "get_mag": {
      const take = parseBoundedInt(params.get("limit"), 1000, 1, 5000);
      const devices = await prisma.magDevice.findMany({
        take,
        include: { line: { select: { username: true } } },
        orderBy: { createdAt: "desc" },
      });
      return { status: "success", mag_devices: devices };
    }

    case "live_connections": {
      const take = parseBoundedInt(params.get("limit"), 1000, 1, 5000);
      const connections = await prisma.liveConnection.findMany({
        take,
        include: {
          line: { select: { username: true } },
          stream: { select: { name: true } },
        },
        orderBy: { lastSeenAt: "desc" },
      });
      return { status: "success", connections };
    }

    case "activity_logs": {
      const take = parseBoundedInt(params.get("limit"), 100, 1, 500);
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
      let maxConnections = parseBoundedInt(params.get("max_connections"), 1, 1, 1000);
      let days = parseBoundedInt(params.get("days"), 30, 1, 3650);
      let bouquetIds = params.getAll("bouquet[]").length
        ? params.getAll("bouquet[]")
        : (params.get("bouquets")?.split(",") ?? []).filter(Boolean);
      const packageId = params.get("package_id") ?? params.get("package");
      if (packageId) {
        const { resolveLineCreateFromPackage } = await import("./package-line");
        const resolved = await resolveLineCreateFromPackage({
          packageId,
          days,
          maxConnections,
          bouquetIds,
        });
        days = resolved.days;
        maxConnections = resolved.maxConnections;
        if (resolved.bouquetIds.length) bouquetIds = resolved.bouquetIds;
      }
      const authMode = params.get("auth_mode") === "active_code" ? "ACTIVE_CODE" : "USERNAME_PASSWORD";
      const activeCode = params.get("active_code")?.trim().toUpperCase() || null;

      if (!username && authMode !== "ACTIVE_CODE") {
        return { status: "error", message: "username required" };
      }
      if (authMode === "ACTIVE_CODE" && !activeCode) {
        return { status: "error", message: "active_code required" };
      }
      if (username) {
        const userErr = validateLineCredential(username, "username");
        if (userErr) return { status: "error", message: userErr };
      }
      const passErr = validateLineCredential(password, "password");
      if (passErr) return { status: "error", message: passErr };

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
      const existing = await prisma.line.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return { status: "error", message: "not found" };
      const data: Prisma.LineUpdateInput = {};
      if (params.get("password")) {
        const nextPass = params.get("password")!;
        const passErr = validateLineCredential(nextPass, "password");
        if (passErr) return { status: "error", message: passErr };
        data.password = nextPass;
      }
      if (params.get("max_connections"))
        data.maxConnections = parseBoundedInt(params.get("max_connections"), 1, 1, 1000);
      if (params.get("days")) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseBoundedInt(params.get("days"), 30, 1, 3650));
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
      const existing = await prisma.line.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return { status: "error", message: "not found" };
      await prisma.line.delete({ where: { id } });
      await logActivity("api_delete_line", { userId: adminId, entityId: id });
      void dispatchOutboundWebhook("line.deleted", { lineId: id });
      return { status: "success" };
    }

    case "create_reseller": {
      const username = params.get("username");
      const password = params.get("password") ?? generatePassword();
      const credits = parseBoundedInt(params.get("credits"), 0, 0, 1_000_000);
      if (!username) return { status: "error", message: "username required" };
      const userErr = validateLineCredential(username, "username");
      if (userErr) return { status: "error", message: userErr };
      const passErr = validateLineCredential(password, "password");
      if (passErr) return { status: "error", message: passErr };

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

    default: {
      const extended = await handleXuiExtendedAction(action, params, adminId);
      if (extended) return extended;
      return { status: "error", message: `unknown action: ${action}` };
    }
  }
}

async function setLineStatus(
  id: string | null,
  status: "ACTIVE" | "DISABLED" | "BANNED",
  adminId: string,
  webhookEvent: string
) {
  if (!id) return { status: "error", message: "id required" };
  const existing = await prisma.line.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { status: "error", message: "not found" };
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

