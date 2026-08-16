import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import {
  PanelNotificationKind,
  PanelNotificationPriority,
  PanelNotificationTarget,
  PanelRole,
} from "@prisma/client";

const CHAT_NOTIFY_COOLDOWN_MS = 2 * 60 * 1000;

async function actorAdminId(fallbackUserId: string): Promise<string> {
  const admin = await prisma.panelUser.findFirst({
    where: { role: PanelRole.ADMIN, isActive: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return admin?.id ?? fallbackUserId;
}

async function recentlyNotified(opts: {
  title: string;
  recipientId: string | null;
  sinceMs: number;
}): Promise<boolean> {
  const since = new Date(Date.now() - opts.sinceMs);
  const dup = await prisma.panelNotification.findFirst({
    where: {
      title: opts.title,
      recipientId: opts.recipientId,
      createdAt: { gte: since },
      kind: PanelNotificationKind.MESSAGE,
    },
    select: { id: true },
  });
  return Boolean(dup);
}

/** In-panel alert when someone posts in Live chat (throttled per recipient). */
export async function notifyLiveChatMessage(opts: {
  fromUserId: string;
  fromUsername: string;
  fromRole: PanelRole;
  body: string;
}): Promise<void> {
  try {
    const settings = await getSettingGroup("notifications");
    if (settings.inPanelAlerts === false) return;

    const preview = opts.body.trim().slice(0, 160);
    const title = `Live chat — ${opts.fromUsername}`;
    const createdById = await actorAdminId(opts.fromUserId);

    if (opts.fromRole === PanelRole.ADMIN) {
      const cooled = await recentlyNotified({
        title,
        recipientId: null,
        sinceMs: CHAT_NOTIFY_COOLDOWN_MS,
      });
      if (cooled) return;
      await prisma.panelNotification.create({
        data: {
          title,
          body: preview,
          kind: PanelNotificationKind.MESSAGE,
          priority: PanelNotificationPriority.NORMAL,
          target: PanelNotificationTarget.ALL_RESELLERS,
          recipientId: null,
          createdById,
        },
      });
      return;
    }

    const admins = await prisma.panelUser.findMany({
      where: { role: PanelRole.ADMIN, isActive: true },
      select: { id: true },
    });
    for (const admin of admins) {
      if (admin.id === opts.fromUserId) continue;
      const cooled = await recentlyNotified({
        title,
        recipientId: admin.id,
        sinceMs: CHAT_NOTIFY_COOLDOWN_MS,
      });
      if (cooled) continue;
      await prisma.panelNotification.create({
        data: {
          title,
          body: preview,
          kind: PanelNotificationKind.MESSAGE,
          priority: PanelNotificationPriority.NORMAL,
          target: PanelNotificationTarget.SPECIFIC_USER,
          recipientId: admin.id,
          createdById,
        },
      });
    }
  } catch (err) {
    console.error("[notifyLiveChatMessage]", err);
  }
}

/** Notify admins that a reseller opened a support ticket. */
export async function notifyTicketCreated(opts: {
  ticketId: string;
  subject: string;
  createdById: string;
  createdByUsername: string;
}): Promise<void> {
  try {
    const settings = await getSettingGroup("notifications");
    if (settings.inPanelAlerts === false) return;

    const creator = await prisma.panelUser.findUnique({
      where: { id: opts.createdById },
      select: { role: true },
    });
    if (!creator || creator.role === PanelRole.ADMIN) return;

    const title = `New support ticket — ${opts.createdByUsername}`;
    const body = opts.subject.trim().slice(0, 200);
    const createdById = await actorAdminId(opts.createdById);

    const admins = await prisma.panelUser.findMany({
      where: { role: PanelRole.ADMIN, isActive: true },
      select: { id: true },
    });
    for (const admin of admins) {
      await prisma.panelNotification.create({
        data: {
          title,
          body: `${body}\n\nOpen Tickets to reply.`,
          kind: PanelNotificationKind.MESSAGE,
          priority: PanelNotificationPriority.HIGH,
          target: PanelNotificationTarget.SPECIFIC_USER,
          recipientId: admin.id,
          createdById,
        },
      });
    }
  } catch (err) {
    console.error("[notifyTicketCreated]", err);
  }
}

/** Notify the other party when a ticket gets a reply (honours notifyTicketReply). */
export async function notifyTicketReply(opts: {
  ticketId: string;
  subject: string;
  authorId: string;
  authorUsername: string;
  authorRole: PanelRole;
  body: string;
  ticketCreatedById: string;
  assignedToId?: string | null;
}): Promise<void> {
  try {
    const settings = await getSettingGroup("notifications");
    if (settings.notifyTicketReply === false) return;
    if (settings.inPanelAlerts === false) return;

    const preview = opts.body.trim().slice(0, 160);
    const title = `Ticket reply — ${opts.subject}`.slice(0, 120);
    const createdById = await actorAdminId(opts.authorId);

    const recipientIds = new Set<string>();
    if (opts.authorRole === PanelRole.ADMIN) {
      recipientIds.add(opts.ticketCreatedById);
    } else {
      if (opts.assignedToId) recipientIds.add(opts.assignedToId);
      const admins = await prisma.panelUser.findMany({
        where: { role: PanelRole.ADMIN, isActive: true },
        select: { id: true },
      });
      for (const a of admins) recipientIds.add(a.id);
    }
    recipientIds.delete(opts.authorId);

    for (const recipientId of recipientIds) {
      await prisma.panelNotification.create({
        data: {
          title,
          body: `${opts.authorUsername}: ${preview}`,
          kind: PanelNotificationKind.MESSAGE,
          priority: PanelNotificationPriority.NORMAL,
          target: PanelNotificationTarget.SPECIFIC_USER,
          recipientId,
          createdById,
        },
      });
    }
  } catch (err) {
    console.error("[notifyTicketReply]", err);
  }
}
