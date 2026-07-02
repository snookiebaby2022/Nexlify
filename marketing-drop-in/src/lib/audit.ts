import { prisma } from "@/lib/prisma";

export async function logAudit(opts: {
  userId?: string;
  email?: string;
  action: string;
  detail?: string;
  ip?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: opts.userId ?? null,
        email: opts.email ?? null,
        action: opts.action,
        detail: opts.detail ?? null,
        ip: opts.ip ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write log:", err);
  }
}
