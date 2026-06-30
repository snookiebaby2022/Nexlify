import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import {
  PanelNotificationKind,
  PanelNotificationPriority,
  PanelNotificationTarget,
  PanelRole,
  type Prisma,
} from "@prisma/client";

const RESELLER_ROLES: PanelRole[] = [PanelRole.RESELLER, PanelRole.SUB_RESELLER];

export type PanelNotificationRow = {
  id: string;
  title: string;
  body: string;
  kind: PanelNotificationKind;
  priority: PanelNotificationPriority;
  target: PanelNotificationTarget;
  recipientId: string | null;
  createdById: string;
  isPinned: boolean;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
  createdBy?: { username: string; displayName: string | null };
  recipient?: { username: string; displayName: string | null } | null;
  readCount?: number;
};

const notificationInclude = {
  createdBy: { select: { username: true, displayName: true } },
  recipient: { select: { username: true, displayName: true } },
} as const;

function activeInboxWhere(now = new Date()): Prisma.PanelNotificationWhereInput {
  return {
    isActive: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

function inboxWhereForUser(user: SessionUser): Prisma.PanelNotificationWhereInput {
  const active = activeInboxWhere();

  if (user.role === PanelRole.ADMIN) {
    return {
      AND: [
        active,
        { target: PanelNotificationTarget.SPECIFIC_USER, recipientId: user.id },
      ],
    };
  }

  return {
    AND: [
      active,
      {
        OR: [
          { target: PanelNotificationTarget.ALL_RESELLERS },
          { target: PanelNotificationTarget.SPECIFIC_USER, recipientId: user.id },
        ],
      },
    ],
  };
}

function serialize(n: {
  id: string;
  title: string;
  body: string;
  kind: PanelNotificationKind;
  priority: PanelNotificationPriority;
  target: PanelNotificationTarget;
  recipientId: string | null;
  createdById: string;
  isPinned: boolean;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: { username: string; displayName: string | null };
  recipient?: { username: string; displayName: string | null } | null;
  _count?: { reads: number };
}): PanelNotificationRow {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    kind: n.kind,
    priority: n.priority,
    target: n.target,
    recipientId: n.recipientId,
    createdById: n.createdById,
    isPinned: n.isPinned,
    isActive: n.isActive,
    expiresAt: n.expiresAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    readAt: null,
    createdBy: n.createdBy,
    recipient: n.recipient,
    readCount: n._count?.reads,
  };
}

export async function listInboxForUser(
  user: SessionUser,
  opts?: { limit?: number }
) {
  const limit = opts?.limit ?? 50;
  const rows = await prisma.panelNotification.findMany({
    where: inboxWhereForUser(user),
    include: {
      ...notificationInclude,
      reads: {
        where: { userId: user.id },
        select: { readAt: true },
        take: 1,
      },
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  return rows.map((n) => {
    const readAt = n.reads[0]?.readAt ?? null;
    return {
      id: n.id,
      title: n.title,
      body: n.body,
      kind: n.kind,
      priority: n.priority,
      target: n.target,
      recipientId: n.recipientId,
      createdById: n.createdById,
      isPinned: n.isPinned,
      isActive: n.isActive,
      expiresAt: n.expiresAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
      readAt: readAt?.toISOString() ?? null,
      createdBy: n.createdBy,
      recipient: n.recipient,
    } satisfies PanelNotificationRow;
  });
}

export async function getUnreadCount(user: SessionUser) {
  const notifications = await prisma.panelNotification.findMany({
    where: inboxWhereForUser(user),
    select: {
      id: true,
      reads: {
        where: { userId: user.id },
        select: { id: true },
        take: 1,
      },
    },
  });
  return notifications.filter((n) => n.reads.length === 0).length;
}

export async function markNotificationRead(notificationId: string, userId: string) {
  const notification = await prisma.panelNotification.findUnique({
    where: { id: notificationId },
    select: { id: true, isActive: true, expiresAt: true },
  });
  if (!notification || !notification.isActive) return null;
  if (notification.expiresAt && notification.expiresAt <= new Date()) return null;

  const read = await prisma.panelNotificationRead.upsert({
    where: {
      notificationId_userId: { notificationId, userId },
    },
    create: { notificationId, userId },
    update: { readAt: new Date() },
  });
  return read;
}

export async function listAdminNotifications() {
  const rows = await prisma.panelNotification.findMany({
    include: {
      ...notificationInclude,
      _count: { select: { reads: true } },
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
  });

  return rows.map((n) => serialize(n));
}

export type CreateNotificationInput = {
  title: string;
  body: string;
  kind: PanelNotificationKind;
  priority?: PanelNotificationPriority;
  target: PanelNotificationTarget;
  recipientId?: string | null;
  isPinned?: boolean;
  expiresAt?: string | null;
};

export async function createNotification(
  createdById: string,
  input: CreateNotificationInput
) {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) throw new Error("Title and body are required");

  if (input.target === PanelNotificationTarget.SPECIFIC_USER) {
    if (!input.recipientId) throw new Error("Recipient is required for specific user target");
    const recipient = await prisma.panelUser.findUnique({
      where: { id: input.recipientId },
      select: { id: true, role: true, isActive: true },
    });
    if (!recipient || !recipient.isActive) throw new Error("Recipient not found");
  }

  const notification = await prisma.panelNotification.create({
    data: {
      title,
      body,
      kind: input.kind,
      priority: input.priority ?? PanelNotificationPriority.NORMAL,
      target: input.target,
      recipientId:
        input.target === PanelNotificationTarget.SPECIFIC_USER
          ? input.recipientId!
          : null,
      createdById,
      isPinned: input.isPinned ?? false,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
    include: notificationInclude,
  });

  return serialize(notification);
}

export async function updateNotification(
  id: string,
  data: {
    isActive?: boolean;
    isPinned?: boolean;
    title?: string;
    body?: string;
    priority?: PanelNotificationPriority;
    expiresAt?: string | null;
  }
) {
  const patch: Prisma.PanelNotificationUpdateInput = {};
  if (data.isActive !== undefined) patch.isActive = data.isActive;
  if (data.isPinned !== undefined) patch.isPinned = data.isPinned;
  if (data.title !== undefined) patch.title = data.title.trim();
  if (data.body !== undefined) patch.body = data.body.trim();
  if (data.priority !== undefined) patch.priority = data.priority;
  if (data.expiresAt !== undefined) {
    patch.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
  }

  const notification = await prisma.panelNotification.update({
    where: { id },
    data: patch,
    include: { ...notificationInclude, _count: { select: { reads: true } } },
  });
  return serialize(notification);
}

export async function deleteNotification(id: string) {
  await prisma.panelNotification.delete({ where: { id } });
}

export async function listResellerOptions() {
  return prisma.panelUser.findMany({
    where: {
      role: { in: RESELLER_ROLES },
      isActive: true,
    },
    select: { id: true, username: true, displayName: true, role: true },
    orderBy: { username: "asc" },
  });
}

export async function canUserAccessNotification(
  notificationId: string,
  user: SessionUser
) {
  const notification = await prisma.panelNotification.findFirst({
    where: { id: notificationId, ...inboxWhereForUser(user) },
    select: { id: true },
  });
  return !!notification;
}
