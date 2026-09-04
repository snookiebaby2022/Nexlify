import { prisma } from "./prisma";
import { hashPassword } from "./auth";
import { logActivity } from "./lines";
import { listActiveConnections } from "./connections";
import { dispatchOutboundWebhook } from "./outbound-webhooks";
import { PanelRole, Prisma, StreamType } from "@prisma/client";
import { handleXuiExtendedAction } from "./xui-api-extended";
import {
  generatePassword,
  parseBoundedInt,
  parseStreamType,
} from "./xui-api-utils";
import { validateLineCredential } from "./credential-generate";
import { resolveLineCredentialMinLength } from "./line-credential-policy";
import {
  type PanelApiCaller,
  lineScopeWhere,
  userScopeWhere,
  connectionScopeWhere,
  assertLineInScope,
} from "./panel-api-caller";
import { assertResellerCanCreateLine, assertRoleMaySetUnlimited } from "./reseller-line-guards";
import { debitResellerCredits, sessionPaysLineCredits } from "./reseller-credit-charge";
import { resolveLineCreateFromPackage } from "./package-line";
import { getResellerBouquetIds } from "./reseller-bouquet-scope";

export {
  authenticatePanelApi,
  authenticateAdminApi,
} from "./panel-api-caller";

export async function handleXuiAction(
  action: string,
  params: URLSearchParams,
  caller: PanelApiCaller
) {
  const actorId = caller.id;
  const credMin = await resolveLineCredentialMinLength();

  switch (action) {
    case "get_bouquets": {
      const allowedIds = caller.isAdmin ? null : await getResellerBouquetIds(caller);
      const bouquets = await prisma.bouquet.findMany({
        where: allowedIds?.length ? { id: { in: allowedIds } } : undefined,
        include: { streams: { include: { stream: true } } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
      return { status: "success", bouquets };
    }

    case "get_users": {
      const take = parseBoundedInt(params.get("limit"), 500, 1, 1000);
      const users = await prisma.panelUser.findMany({
        where: userScopeWhere(caller),
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
        where: lineScopeWhere(caller),
        take,
        include: { bouquets: { include: { bouquet: true } } },
        orderBy: { createdAt: "desc" },
      });
      return { status: "success", lines };
    }

    case "get_line": {
      const id = params.get("id");
      if (!id) return { status: "error", message: "id required" };
      const scope = await assertLineInScope(id, caller);
      if (!scope.ok) return { status: "error", message: scope.message };
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
        where: caller.isAdmin ? undefined : { line: { ownerId: caller.id } },
        take,
        include: { line: { select: { username: true } } },
        orderBy: { createdAt: "desc" },
      });
      return { status: "success", mag_devices: devices };
    }

    case "live_connections": {
      const take = parseBoundedInt(params.get("limit"), 1000, 1, 5000);
      const connections = await prisma.liveConnection.findMany({
        where: connectionScopeWhere(caller),
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
        where: caller.isAdmin
          ? undefined
          : {
              OR: [{ userId: caller.id }, { line: { ownerId: caller.id } }],
            },
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
      if (!caller.isAdmin) return { status: "error", message: "not found" };
      const codes = await prisma.accessCode.findMany({ orderBy: { createdAt: "desc" } });
      return { status: "success", access_codes: codes };
    }

    case "get_analytics": {
      const topChannels = await prisma.lineChannelWatch.findMany({
        where: caller.isAdmin ? undefined : { line: { ownerId: caller.id } },
        orderBy: { watchCount: "desc" },
        take: 20,
        include: { stream: { select: { id: true, name: true, type: true } } },
      });
      const connections = await listActiveConnections(caller.isAdmin ? undefined : caller.id);
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
      let creditCost = 0;

      if (packageId) {
        try {
          const resolved = await resolveLineCreateFromPackage(
            { packageId, days, maxConnections, bouquetIds },
            { sellerId: caller.isAdmin ? null : caller.id }
          );
          days = resolved.days;
          maxConnections = resolved.maxConnections;
          if (resolved.bouquetIds.length) bouquetIds = resolved.bouquetIds;
          creditCost = resolved.creditCost;
        } catch (e) {
          return { status: "error", message: e instanceof Error ? e.message : String(e) };
        }
      } else if (sessionPaysLineCredits(caller.role)) {
        const { creditCostForDays, effectiveCreditCost } = await import("./package-credits");
        creditCost = effectiveCreditCost(days, creditCostForDays(days), false);
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
        const userErr = validateLineCredential(username, "username", credMin);
        if (userErr) return { status: "error", message: userErr };
      }
      const passErr = validateLineCredential(password, "password", credMin);
      if (passErr) return { status: "error", message: passErr };

      const unlimitedGuard = assertRoleMaySetUnlimited(caller.role, { days });
      if (!unlimitedGuard.ok) return { status: "error", message: unlimitedGuard.error };

      const guard = await assertResellerCanCreateLine(caller, bouquetIds);
      if (!guard.ok) return { status: "error", message: guard.error };
      bouquetIds = guard.bouquetIds;

      if (!caller.isAdmin && !bouquetIds.length) {
        return { status: "error", message: "Select at least one bouquet for this line" };
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);
      const ownerId = caller.isAdmin ? undefined : caller.id;

      const line = await prisma.$transaction(async (tx) => {
        if (sessionPaysLineCredits(caller.role) && creditCost > 0) {
          await debitResellerCredits(tx, {
            userId: caller.id,
            amount: creditCost,
            note: `Line ${username ?? activeCode}`,
          });
          const { getResellerLineRewardPercent, applyResellerLineReward } = await import(
            "./reseller-rewards"
          );
          const rewardPercent = await getResellerLineRewardPercent();
          if (rewardPercent > 0) {
            await applyResellerLineReward(tx, {
              userId: caller.id,
              spent: creditCost,
              percent: rewardPercent,
              lineUsername: username ?? activeCode!,
            });
          }
        }

        return tx.line.create({
          data: {
            username: username ?? activeCode!,
            password: authMode === "ACTIVE_CODE" ? (password || activeCode!) : password,
            maxConnections,
            expiresAt,
            authMode,
            activeCode: authMode === "ACTIVE_CODE" ? activeCode : null,
            packageId: packageId || undefined,
            ownerId,
            bouquets: {
              create: bouquetIds.map((bouquetId) => ({ bouquetId })),
            },
          },
          include: { bouquets: true },
        });
      });

      await logActivity("api_create_line", {
        userId: actorId,
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
      const scope = await assertLineInScope(id, caller);
      if (!scope.ok) return { status: "error", message: scope.message };
      const data: Prisma.LineUpdateInput = {};
      if (params.get("password")) {
        const nextPass = params.get("password")!;
        const passErr = validateLineCredential(nextPass, "password", credMin);
        if (passErr) return { status: "error", message: passErr };
        data.password = nextPass;
      }
      if (params.get("max_connections"))
        data.maxConnections = parseBoundedInt(params.get("max_connections"), 1, 1, 1000);
      if (params.get("days")) {
        const nextDays = parseBoundedInt(params.get("days"), 30, 1, 3650);
        const unlimitedGuard = assertRoleMaySetUnlimited(caller.role, { days: nextDays });
        if (!unlimitedGuard.ok) return { status: "error", message: unlimitedGuard.error };
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + nextDays);
        data.expiresAt = expiresAt;
      }
      if (params.get("auth_mode") === "active_code") data.authMode = "ACTIVE_CODE";
      if (params.get("active_code")) data.activeCode = params.get("active_code")!.trim().toUpperCase();
      const line = await prisma.line.update({
        where: { id },
        data,
        include: { bouquets: true },
      });
      await logActivity("api_edit_line", { userId: actorId, lineId: line.id });
      void dispatchOutboundWebhook("line.updated", { lineId: line.id });
      return { status: "success", line };
    }

    case "disable_line":
      return setLineStatus(params.get("id"), "DISABLED", caller, "line.disabled");
    case "enable_line":
      return setLineStatus(params.get("id"), "ACTIVE", caller, "line.enabled");
    case "ban_line":
      return setLineStatus(params.get("id"), "BANNED", caller, "line.banned");
    case "unban_line":
      return setLineStatus(params.get("id"), "ACTIVE", caller, "line.enabled");

    case "delete_line": {
      const id = params.get("id");
      if (!id) return { status: "error", message: "id required" };
      const scope = await assertLineInScope(id, caller);
      if (!scope.ok) return { status: "error", message: scope.message };
      await prisma.line.delete({ where: { id } });
      await logActivity("api_delete_line", { userId: actorId, entityId: id });
      void dispatchOutboundWebhook("line.deleted", { lineId: id });
      return { status: "success" };
    }

    case "create_reseller": {
      const username = params.get("username");
      const password = params.get("password") ?? generatePassword();
      const credits = parseBoundedInt(params.get("credits"), 0, 0, 1_000_000);
      if (!username) return { status: "error", message: "username required" };
      const userErr = validateLineCredential(username, "username", credMin);
      if (userErr) return { status: "error", message: userErr };
      const passErr = validateLineCredential(password, "password", credMin);
      if (passErr) return { status: "error", message: passErr };

      const role = caller.isAdmin ? PanelRole.RESELLER : PanelRole.SUB_RESELLER;
      if (!caller.isAdmin && credits > 0) {
        const parent = await prisma.panelUser.findUnique({
          where: { id: caller.id },
          select: { credits: true },
        });
        if (!parent || parent.credits < credits) {
          return { status: "error", message: "Insufficient credits" };
        }
      }

      const reseller = await prisma.$transaction(async (tx) => {
        if (!caller.isAdmin && credits > 0) {
          await debitResellerCredits(tx, {
            userId: caller.id,
            amount: credits,
            note: `Sub-reseller ${username}`,
          });
        }
        return tx.panelUser.create({
          data: {
            username,
            passwordHash: await hashPassword(password),
            role,
            credits,
            parentId: caller.id,
          },
        });
      });

      if (!caller.isAdmin && credits > 0) {
        await prisma.creditTransaction.create({
          data: {
            userId: reseller.id,
            amount: credits,
            balanceAfter: reseller.credits,
            note: "api create_reseller",
          },
        }).catch(() => undefined);
      }

      return { status: "success", reseller: { id: reseller.id, username }, password };
    }

    default: {
      const extended = await handleXuiExtendedAction(action, params, caller);
      if (extended) return extended;
      return { status: "error", message: `unknown action: ${action}` };
    }
  }
}

async function setLineStatus(
  id: string | null,
  status: "ACTIVE" | "DISABLED" | "BANNED",
  caller: PanelApiCaller,
  webhookEvent: string
) {
  if (!id) return { status: "error", message: "id required" };
  const scope = await assertLineInScope(id, caller);
  if (!scope.ok) return { status: "error", message: scope.message };
  const line = await prisma.line.update({
    where: { id },
    data: { status },
  });
  await logActivity(`api_${status.toLowerCase()}_line`, {
    userId: caller.id,
    lineId: line.id,
  });
  void dispatchOutboundWebhook(webhookEvent, { lineId: line.id, status });
  return { status: "success", line };
}
