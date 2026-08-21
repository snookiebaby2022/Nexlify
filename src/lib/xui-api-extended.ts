import { prisma } from "./prisma";
import { hashPassword } from "./auth";
import { logActivity } from "./lines";
import { kickLineConnections, listActiveConnections } from "./connections";
import { PanelRole, Prisma, StreamType, CategoryType } from "@prisma/client";
import { generatePassword } from "./xui-api-utils";

export async function handleXuiExtendedAction(
  action: string,
  params: URLSearchParams,
  adminId: string
): Promise<{ status: string; message?: string; [key: string]: unknown } | null> {
  switch (action) {
    case "get_categories": {
      const categoryType = params.get("category_type") ?? params.get("type");
      const categories = await prisma.category.findMany({
        where: categoryType ? { categoryType: categoryType as CategoryType } : undefined,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
      return { status: "success", categories };
    }

    case "get_packages": {
      const packages = await prisma.package.findMany({ orderBy: { sortOrder: "asc" } });
      return { status: "success", packages };
    }

    case "get_servers": {
      const servers = await prisma.streamServer.findMany({ orderBy: { name: "asc" } });
      return { status: "success", servers };
    }

    case "get_server": {
      const id = params.get("id");
      if (!id) return { status: "error", message: "id required" };
      const server = await prisma.streamServer.findUnique({ where: { id } });
      if (!server) return { status: "error", message: "not found" };
      return { status: "success", server };
    }

    case "get_reg_users":
    case "get_resellers": {
      const users = await prisma.panelUser.findMany({
        where: { role: { in: [PanelRole.RESELLER, PanelRole.SUB_RESELLER] } },
        select: {
          id: true,
          username: true,
          role: true,
          credits: true,
          isActive: true,
          parentId: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(5000, parseInt(params.get("limit") ?? "1000", 10)),
      });
      return { status: "success", users };
    }

    case "get_epg": {
      const streamId = params.get("stream_id") ?? params.get("streamId");
      if (!streamId) return { status: "error", message: "stream_id required" };
      const stream = await prisma.stream.findUnique({ where: { id: streamId } });
      const channelId = stream?.epgChannelId ?? stream?.channelId ?? streamId;
      const rows = await prisma.epgProgram.findMany({
        where: { channelId },
        orderBy: { start: "asc" },
        take: Math.min(500, parseInt(params.get("limit") ?? "100", 10)),
      });
      return { status: "success", epg: rows };
    }

    case "kick_user":
    case "kill_connection":
    case "kill_connections": {
      const lineId = params.get("line_id") ?? params.get("id");
      if (!lineId) return { status: "error", message: "line_id required" };
      const kicked = await kickLineConnections(lineId);
      await logActivity("api_kick_line", { userId: adminId, lineId, entityId: lineId });
      return { status: "success", kicked };
    }

    case "renew_line": {
      const id = params.get("id");
      const days = parseInt(params.get("days") ?? "30", 10);
      if (!id) return { status: "error", message: "id required" };
      const line = await prisma.line.findUnique({ where: { id } });
      if (!line) return { status: "error", message: "not found" };
      const expiresAt = new Date(Math.max(line.expiresAt.getTime(), Date.now()));
      expiresAt.setDate(expiresAt.getDate() + days);
      const updated = await prisma.line.update({
        where: { id },
        data: { expiresAt, status: "ACTIVE" },
      });
      return { status: "success", line: updated };
    }

    case "create_bouquet": {
      const name = params.get("name");
      if (!name) return { status: "error", message: "name required" };
      const bouquet = await prisma.bouquet.create({ data: { name } });
      return { status: "success", bouquet };
    }

    case "edit_bouquet": {
      const id = params.get("id");
      const name = params.get("name");
      if (!id || !name) return { status: "error", message: "id and name required" };
      const bouquet = await prisma.bouquet.update({ where: { id }, data: { name } });
      return { status: "success", bouquet };
    }

    case "delete_bouquet": {
      const id = params.get("id");
      if (!id) return { status: "error", message: "id required" };
      await prisma.bouquet.delete({ where: { id } });
      return { status: "success" };
    }

    case "create_stream": {
      const name = params.get("name");
      const streamUrl = params.get("stream_url") ?? params.get("url");
      if (!name || !streamUrl) return { status: "error", message: "name and stream_url required" };
      const stream = await prisma.stream.create({
        data: {
          name,
          streamUrl,
          type: (params.get("type") as StreamType) || StreamType.LIVE,
          categoryId: params.get("category_id") || null,
        },
      });
      return { status: "success", stream };
    }

    case "edit_stream": {
      const id = params.get("id");
      if (!id) return { status: "error", message: "id required" };
      const data: Prisma.StreamUpdateInput = {};
      if (params.get("name")) data.name = params.get("name")!;
      if (params.get("stream_url")) data.streamUrl = params.get("stream_url")!;
      if (params.get("category_id")) data.category = { connect: { id: params.get("category_id")! } };
      const stream = await prisma.stream.update({ where: { id }, data });
      return { status: "success", stream };
    }

    case "delete_stream": {
      const id = params.get("id");
      if (!id) return { status: "error", message: "id required" };
      await prisma.stream.delete({ where: { id } });
      return { status: "success" };
    }

    case "edit_user": {
      const id = params.get("id");
      if (!id) return { status: "error", message: "id required" };
      const data: Prisma.PanelUserUpdateInput = {};
      if (params.get("password")) data.passwordHash = await hashPassword(params.get("password")!);
      if (params.get("credits")) data.credits = parseInt(params.get("credits")!, 10);
      if (params.get("is_active") === "0") data.isActive = false;
      if (params.get("is_active") === "1") data.isActive = true;
      const user = await prisma.panelUser.update({ where: { id }, data });
      return { status: "success", user: { id: user.id, username: user.username, role: user.role } };
    }

    case "delete_user": {
      const id = params.get("id");
      if (!id) return { status: "error", message: "id required" };
      await prisma.panelUser.delete({ where: { id } });
      return { status: "success" };
    }

    case "create_mag": {
      const mac = params.get("mac");
      const lineId = params.get("line_id");
      if (!mac || !lineId) return { status: "error", message: "mac and line_id required" };
      const device = await prisma.magDevice.create({ data: { mac, lineId } });
      return { status: "success", mag_device: device };
    }

    case "delete_mag": {
      const id = params.get("id");
      if (!id) return { status: "error", message: "id required" };
      await prisma.magDevice.delete({ where: { id } });
      return { status: "success" };
    }

    case "get_transcodes": {
      return {
        status: "success",
        transcodes: [
          { id: "copy", name: "Copy", cmd: "-c copy" },
          { id: "h264_720", name: "H.264 720p", cmd: "-c:v libx264 -preset veryfast -vf scale=1280:720" },
        ],
      };
    }

    case "get_events": {
      const logs = await prisma.activityLog.findMany({
        take: Math.min(200, parseInt(params.get("limit") ?? "50", 10)),
        orderBy: { createdAt: "desc" },
      });
      return { status: "success", events: logs };
    }

    case "user_info":
    case "get_user_info": {
      const user = await prisma.panelUser.findUnique({
        where: { id: adminId },
        select: { id: true, username: true, role: true, credits: true, apiKey: true },
      });
      return { status: "success", user_info: user };
    }

    case "get_connection_stats": {
      const connections = await listActiveConnections();
      return {
        status: "success",
        open_connections: connections.length,
        connections,
      };
    }

    case "create_staff": {
      const username = params.get("username");
      const password = params.get("password") ?? generatePassword();
      const preset = params.get("preset") ?? "support_agent";
      if (!username) return { status: "error", message: "username required" };
      const { permissionsForPreset } = await import("./staff-permissions");
      const staff = await prisma.panelUser.create({
        data: {
          username,
          passwordHash: await hashPassword(password),
          role: PanelRole.STAFF,
          permissions: permissionsForPreset(preset),
          parentId: adminId,
        },
      });
      return { status: "success", staff: { id: staff.id, username: staff.username }, password };
    }

    default:
      return null;
  }
}
