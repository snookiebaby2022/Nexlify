import { prisma } from "./prisma";
import { hashPassword } from "./auth";
import { logActivity } from "./lines";
import { kickLineConnections, listActiveConnections } from "./connections";
import { PanelRole, Prisma, StreamType, CategoryType } from "@prisma/client";
import { generatePassword, parseBoundedInt, parseCategoryType, parseStreamType } from "./xui-api-utils";
import { validateLineCredential } from "./credential-generate";
import {
  type PanelApiCaller,
  userScopeWhere,
  assertLineInScope,
  assertUserInScope,
  assertUserByUsernameInScope,
} from "./panel-api-caller";
import { assertResellerCanCreateLine } from "./reseller-line-guards";
import { debitResellerCredits, sessionPaysLineCredits } from "./reseller-credit-charge";
import { chargeLineRenewCredits } from "./line-renew-credits";

export async function handleXuiExtendedAction(
  action: string,
  params: URLSearchParams,
  caller: PanelApiCaller
): Promise<{ status: string; message?: string; [key: string]: unknown } | null> {
  const actorId = caller.id;

  switch (action) {
    case "get_categories": {
      const categoryType = parseCategoryType(params.get("category_type") ?? params.get("type"));
      const categories = await prisma.category.findMany({
        where: categoryType ? { categoryType } : undefined,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
      return { status: "success", categories };
    }

    case "get_packages": {
      const packages = await prisma.package.findMany({ orderBy: { sortOrder: "asc" } });
      return { status: "success", packages };
    }

    case "add_credits": {
      const username = params.get("username") ?? params.get("reseller");
      const amount = parseBoundedInt(params.get("credits") ?? params.get("amount"), 0, 1, 1_000_000);
      if (!username) return { status: "error", message: "username required" };
      if (!amount) return { status: "error", message: "credits required" };

      const target = await assertUserByUsernameInScope(username, caller);
      if (!target.ok) return { status: "error", message: target.message };
      const user = target.user;

      if (!caller.isAdmin) {
        if (user.parentId !== caller.id) {
          return { status: "error", message: "not found" };
        }
        const parent = await prisma.panelUser.findUnique({
          where: { id: caller.id },
          select: { credits: true },
        });
        if (!parent || parent.credits < amount) {
          return { status: "error", message: "Insufficient credits" };
        }

        const updated = await prisma.$transaction(async (tx) => {
          await debitResellerCredits(tx, {
            userId: caller.id,
            amount,
            note: params.get("note") ?? `api add_credits ${username}`,
          });
          const child = await tx.panelUser.update({
            where: { id: user.id },
            data: { credits: { increment: amount } },
          });
          await tx.creditTransaction.create({
            data: {
              userId: user.id,
              amount,
              balanceAfter: child.credits,
              note: params.get("note") ?? "api add_credits",
            },
          }).catch(() => undefined);
          return child;
        });

        await logActivity("api_add_credits", {
          userId: actorId,
          entity: "user",
          entityId: user.id,
          meta: { amount },
        });
        return { status: "success", username, credits: updated.credits };
      }

      const updated = await prisma.panelUser.update({
        where: { id: user.id },
        data: { credits: { increment: amount } },
      });
      await prisma.creditTransaction.create({
        data: {
          userId: user.id,
          amount,
          balanceAfter: updated.credits,
          note: params.get("note") ?? "api add_credits",
        },
      }).catch(() => undefined);
      await logActivity("api_add_credits", { userId: actorId, entity: "user", entityId: user.id, meta: { amount } });
      return { status: "success", username, credits: updated.credits };
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
        where: {
          role: { in: [PanelRole.RESELLER, PanelRole.SUB_RESELLER] },
          ...userScopeWhere(caller),
        },
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
        take: parseBoundedInt(params.get("limit"), 1000, 1, 5000),
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
        take: parseBoundedInt(params.get("limit"), 100, 1, 500),
      });
      return { status: "success", epg: rows };
    }

    case "kick_user":
    case "kill_connection":
    case "kill_connections": {
      const lineId = params.get("line_id") ?? params.get("id");
      if (!lineId) return { status: "error", message: "line_id required" };
      const scope = await assertLineInScope(lineId, caller);
      if (!scope.ok) return { status: "error", message: scope.message };
      const kicked = await kickLineConnections(lineId);
      await logActivity("api_kick_line", { userId: actorId, lineId, entityId: lineId });
      return { status: "success", kicked };
    }

    case "renew_line": {
      const id = params.get("id");
      const days = parseBoundedInt(params.get("days"), 30, 1, 3650);
      if (!id) return { status: "error", message: "id required" };
      const scope = await assertLineInScope(id, caller);
      if (!scope.ok) return { status: "error", message: scope.message };
      const line = await prisma.line.findUnique({ where: { id } });
      if (!line) return { status: "error", message: "not found" };
      const expiresAt = new Date(Math.max(line.expiresAt.getTime(), Date.now()));
      expiresAt.setDate(expiresAt.getDate() + days);
      const updated = await prisma.$transaction(async (tx) => {
        if (sessionPaysLineCredits(caller.role)) {
          await chargeLineRenewCredits(tx, caller, {
            days,
            packageId: line.packageId ?? undefined,
            lineUsername: line.username,
          });
        }
        return tx.line.update({
          where: { id },
          data: { expiresAt, status: "ACTIVE" },
        });
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
      const existing = await prisma.bouquet.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return { status: "error", message: "not found" };
      const bouquet = await prisma.bouquet.update({ where: { id }, data: { name } });
      return { status: "success", bouquet };
    }

    case "delete_bouquet": {
      const id = params.get("id");
      if (!id) return { status: "error", message: "id required" };
      const existing = await prisma.bouquet.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return { status: "error", message: "not found" };
      await prisma.bouquet.delete({ where: { id } });
      return { status: "success" };
    }

    case "create_stream": {
      const name = params.get("name");
      const streamUrl = params.get("stream_url") ?? params.get("url");
      if (!name || !streamUrl) return { status: "error", message: "name and stream_url required" };
      const streamType = parseStreamType(params.get("type")) ?? StreamType.LIVE;
      const stream = await prisma.stream.create({
        data: {
          name,
          streamUrl,
          type: streamType,
          categoryId: params.get("category_id") || null,
        },
      });
      return { status: "success", stream };
    }

    case "edit_stream": {
      const id = params.get("id");
      if (!id) return { status: "error", message: "id required" };
      const existing = await prisma.stream.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return { status: "error", message: "not found" };
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
      const existing = await prisma.stream.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return { status: "error", message: "not found" };
      await prisma.stream.delete({ where: { id } });
      return { status: "success" };
    }

    case "edit_user": {
      const id = params.get("id");
      if (!id) return { status: "error", message: "id required" };
      const scope = await assertUserInScope(id, caller);
      if (!scope.ok) return { status: "error", message: scope.message };
      const data: Prisma.PanelUserUpdateInput = {};
      if (params.get("password")) {
        const passErr = validateLineCredential(params.get("password")!, "password");
        if (passErr) return { status: "error", message: passErr };
        data.passwordHash = await hashPassword(params.get("password")!);
      }
      if (params.get("credits") && !caller.isAdmin) {
        return { status: "error", message: "use add_credits to transfer credits" };
      }
      if (params.get("credits")) data.credits = parseBoundedInt(params.get("credits"), 0, 0, 1_000_000);
      if (params.get("is_active") === "0") data.isActive = false;
      if (params.get("is_active") === "1") data.isActive = true;
      const user = await prisma.panelUser.update({ where: { id }, data });
      return { status: "success", user: { id: user.id, username: user.username, role: user.role } };
    }

    case "delete_user": {
      const id = params.get("id");
      if (!id) return { status: "error", message: "id required" };
      if (id === actorId) return { status: "error", message: "cannot delete self" };
      const scope = await assertUserInScope(id, caller);
      if (!scope.ok) return { status: "error", message: scope.message };
      const existing = await prisma.panelUser.findUnique({
        where: { id },
        select: { id: true, role: true },
      });
      if (!existing) return { status: "error", message: "not found" };
      if (existing.role === PanelRole.ADMIN) return { status: "error", message: "cannot delete admin" };
      await prisma.panelUser.delete({ where: { id } });
      return { status: "success" };
    }

    case "create_mag": {
      const mac = params.get("mac");
      const lineId = params.get("line_id");
      if (!mac || !lineId) return { status: "error", message: "mac and line_id required" };
      const scope = await assertLineInScope(lineId, caller);
      if (!scope.ok) return { status: "error", message: scope.message };
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
      const { FFMPEG_TRANSCODE_PROFILES, buildFfmpegTranscodeArgs } = await import("./ffmpeg-transcode-profiles");
      return {
        status: "success",
        transcodes: FFMPEG_TRANSCODE_PROFILES.map((p) => ({
          id: p.id,
          name: p.label,
          cmd: buildFfmpegTranscodeArgs(p, "{input}").join(" "),
        })),
      };
    }

    case "start_stream":
    case "stop_stream":
    case "restart_stream": {
      const streamId = params.get("stream_id") ?? params.get("id");
      if (!streamId) return { status: "error", message: "stream_id required" };
      const stream = await prisma.stream.findUnique({
        where: { id: streamId },
        select: { id: true, serverId: true },
      });
      if (!stream?.serverId) return { status: "error", message: "stream has no server" };
      const { enqueueAgentCommand } = await import("./stream-agent");
      const cmd =
        action === "start_stream"
          ? "start_stream"
          : action === "stop_stream"
            ? "stop_stream"
            : "restart_stream";
      await enqueueAgentCommand(stream.serverId, cmd, { streamId });
      return { status: "success", queued: cmd };
    }

    case "add_stream_to_bouquet":
    case "remove_stream_from_bouquet": {
      const bouquetId = params.get("bouquet_id") ?? params.get("bouquetId");
      const streamId = params.get("stream_id") ?? params.get("streamId");
      if (!bouquetId || !streamId) return { status: "error", message: "bouquet_id and stream_id required" };
      if (action === "add_stream_to_bouquet") {
        await prisma.bouquetStream.upsert({
          where: { bouquetId_streamId: { bouquetId, streamId } },
          create: { bouquetId, streamId },
          update: {},
        });
      } else {
        await prisma.bouquetStream.deleteMany({ where: { bouquetId, streamId } });
      }
      return { status: "success" };
    }

    case "set_epg_channel": {
      const streamId = params.get("stream_id") ?? params.get("id");
      const epgChannelId = params.get("epg_channel_id") ?? params.get("channel_id");
      if (!streamId || !epgChannelId) return { status: "error", message: "stream_id and epg_channel_id required" };
      const stream = await prisma.stream.update({
        where: { id: streamId },
        data: { epgChannelId: String(epgChannelId) },
      });
      return { status: "success", stream };
    }

    case "set_line_bouquets":
    case "assign_bouquets_to_line": {
      const lineId = params.get("line_id") ?? params.get("id");
      if (!lineId) return { status: "error", message: "line_id required" };
      const scope = await assertLineInScope(lineId, caller);
      if (!scope.ok) return { status: "error", message: scope.message };
      const bouquetIds = params.getAll("bouquet[]").length
        ? params.getAll("bouquet[]")
        : (params.get("bouquets")?.split(",").filter(Boolean) ?? []);
      const guard = await assertResellerCanCreateLine(caller, bouquetIds);
      if (!guard.ok) return { status: "error", message: guard.error };
      await prisma.lineBouquet.deleteMany({ where: { lineId } });
      if (bouquetIds.length) {
        await prisma.lineBouquet.createMany({
          data: bouquetIds.map((bouquetId) => ({ lineId, bouquetId })),
          skipDuplicates: true,
        });
      }
      const line = await prisma.line.findUnique({
        where: { id: lineId },
        include: { bouquets: { include: { bouquet: true } } },
      });
      return { status: "success", line };
    }

    case "get_bouquet_streams": {
      const bouquetId = params.get("bouquet_id") ?? params.get("id");
      if (!bouquetId) return { status: "error", message: "bouquet_id required" };
      const rows = await prisma.bouquetStream.findMany({
        where: { bouquetId },
        include: { stream: { select: { id: true, name: true, type: true, isActive: true } } },
        orderBy: { sortOrder: "asc" },
      });
      return { status: "success", streams: rows.map((r) => r.stream) };
    }

    case "mass_enable_streams":
    case "mass_disable_streams": {
      const ids = params.getAll("stream_id[]").length
        ? params.getAll("stream_id[]")
        : (params.get("stream_ids")?.split(",").filter(Boolean) ?? []);
      if (!ids.length) return { status: "error", message: "stream_ids required" };
      const isActive = action === "mass_enable_streams";
      const result = await prisma.stream.updateMany({
        where: { id: { in: ids } },
        data: { isActive },
      });
      return { status: "success", updated: result.count };
    }

    case "get_processes":
    case "get_stream_processes": {
      const serverId = params.get("server_id") ?? params.get("serverId");
      const processes = await prisma.streamProcess.findMany({
        where: serverId ? { serverId } : undefined,
        include: {
          stream: { select: { id: true, name: true } },
          server: { select: { id: true, name: true } },
        },
        orderBy: { lastSeenAt: "desc" },
        take: parseBoundedInt(params.get("limit"), 200, 1, 500),
      });
      return { status: "success", processes };
    }

    case "sync_epg":
    case "reload_epg": {
      const sourceId = params.get("source_id") ?? params.get("id");
      if (!sourceId) return { status: "error", message: "source_id required" };
      const { syncEpgSource } = await import("./epg");
      const result = await syncEpgSource(sourceId);
      return { status: "success", result };
    }

    case "create_category": {
      const name = params.get("name");
      if (!name) return { status: "error", message: "name required" };
      const categoryType = parseCategoryType(params.get("category_type")) ?? CategoryType.LIVE;
      const category = await prisma.category.create({
        data: { name, categoryType },
      });
      return { status: "success", category };
    }

    case "edit_category": {
      const id = params.get("id");
      const name = params.get("name");
      if (!id || !name) return { status: "error", message: "id and name required" };
      const existing = await prisma.category.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return { status: "error", message: "not found" };
      const category = await prisma.category.update({ where: { id }, data: { name } });
      return { status: "success", category };
    }

    case "delete_category": {
      const id = params.get("id");
      if (!id) return { status: "error", message: "id required" };
      const existing = await prisma.category.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return { status: "error", message: "not found" };
      await prisma.category.delete({ where: { id } });
      return { status: "success" };
    }

    case "apply_server_config":
    case "reload_nginx": {
      const serverId = params.get("server_id") ?? params.get("id");
      if (!serverId) return { status: "error", message: "server_id required" };
      const { bumpConfigRevision, enqueueAgentCommand } = await import("./stream-agent");
      const revision = await bumpConfigRevision(serverId);
      await enqueueAgentCommand(serverId, "apply_config", { reason: "api_reload" });
      return { status: "success", revision };
    }

    case "reorder_bouquets": {
      const ids = params.get("order")?.split(",").filter(Boolean) ?? [];
      await Promise.all(ids.map((id, i) => prisma.bouquet.update({ where: { id }, data: { sortOrder: i } })));
      return { status: "success", count: ids.length };
    }

    case "assign_bouquet_to_reseller": {
      if (!caller.isAdmin) return { status: "error", message: "not found" };
      const userId = params.get("user_id") ?? params.get("reseller_id");
      const bouquetId = params.get("bouquet_id");
      if (!userId || !bouquetId) return { status: "error", message: "user_id and bouquet_id required" };
      await prisma.resellerBouquet.upsert({
        where: { userId_bouquetId: { userId, bouquetId } },
        create: { userId, bouquetId },
        update: {},
      });
      return { status: "success" };
    }

    case "get_dashboard": {
      const lineWhere = caller.isAdmin ? {} : { ownerId: caller.id };
      const [lines, streams, connections, resellers] = await Promise.all([
        prisma.line.count({ where: lineWhere }),
        prisma.stream.count({ where: { isActive: true } }),
        prisma.liveConnection.count({
          where: caller.isAdmin ? undefined : { line: { ownerId: caller.id } },
        }),
        prisma.panelUser.count({
          where: {
            role: { in: [PanelRole.RESELLER, PanelRole.SUB_RESELLER] },
            ...userScopeWhere(caller),
          },
        }),
      ]);
      return {
        status: "success",
        dashboard: { lines, streams, open_connections: connections, resellers },
      };
    }

    case "get_events": {
      const logs = await prisma.activityLog.findMany({
        where: caller.isAdmin
          ? undefined
          : { OR: [{ userId: caller.id }, { line: { ownerId: caller.id } }] },
        take: parseBoundedInt(params.get("limit"), 50, 1, 200),
        orderBy: { createdAt: "desc" },
      });
      return { status: "success", events: logs };
    }

    case "user_info":
    case "get_user_info": {
      const user = await prisma.panelUser.findUnique({
        where: { id: actorId },
        select: { id: true, username: true, role: true, credits: true },
      });
      return { status: "success", user_info: user };
    }

    case "get_connection_stats": {
      const connections = await listActiveConnections(caller.isAdmin ? undefined : caller.id);
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
      const userErr = validateLineCredential(username, "username");
      if (userErr) return { status: "error", message: userErr };
      const passErr = validateLineCredential(password, "password");
      if (passErr) return { status: "error", message: passErr };
      const { permissionsForPreset } = await import("./staff-permissions");
      const staff = await prisma.panelUser.create({
        data: {
          username,
          passwordHash: await hashPassword(password),
          role: PanelRole.STAFF,
          permissions: permissionsForPreset(preset),
          parentId: actorId,
        },
      });
      return { status: "success", staff: { id: staff.id, username: staff.username }, password };
    }

    default:
      return null;
  }
}
