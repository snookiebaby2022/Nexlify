import { PanelRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { sendPanelEmail, panelReportRecipient } from "@/lib/panel-email";
import { sendTelegramAlert } from "@/lib/panel-telegram-alerts";

async function ticketEmailEnabled(): Promise<{ ok: boolean; to: string }> {
  const settings = await getSettingGroup("notifications");
  if (settings.emailEnabled === false) return { ok: false, to: "" };
  if (settings.ticketNotifyEmail === false) return { ok: false, to: "" };
  const to = String(settings.notifyEmail ?? "").trim() || panelReportRecipient();
  if (!to) return { ok: false, to: "" };
  return { ok: true, to };
}

async function ticketTelegramEnabled(): Promise<boolean> {
  const notifications = await getSettingGroup("notifications");
  if (notifications.ticketNotifyTelegram === false) return false;
  const monitoring = await getSettingGroup("monitoring");
  return monitoring.telegramAlertsEnabled !== false;
}

export async function notifyTicketCreatedExternal(opts: {
  ticketId: string;
  subject: string;
  createdByUsername: string;
}): Promise<void> {
  const title = `New support ticket — ${opts.createdByUsername}`;
  const body = `${opts.subject.trim()}\nTicket ID: ${opts.ticketId}\n\nOpen Admin → Tickets to reply.`;

  const email = await ticketEmailEnabled();
  if (email.ok) {
    try {
      await sendPanelEmail({ to: email.to, subject: title, text: body });
    } catch (err) {
      console.error("[notifyTicketCreatedExternal email]", err);
    }
  }

  if (await ticketTelegramEnabled()) {
    const r = await sendTelegramAlert(`${title}\n${body}`);
    if (!r.ok) console.error("[notifyTicketCreatedExternal telegram]", r.error);
  }
}

export async function notifyTicketReplyExternal(opts: {
  subject: string;
  authorUsername: string;
  authorRole: PanelRole;
  body: string;
  ticketCreatedById: string;
  assignedToId?: string | null;
}): Promise<void> {
  const notifications = await getSettingGroup("notifications");
  if (notifications.notifyTicketReply === false) return;

  const preview = opts.body.trim().slice(0, 400);
  const title = `Ticket reply — ${opts.subject}`.slice(0, 120);
  const text = `${opts.authorUsername} (${opts.authorRole}):\n${preview}`;

  const email = await ticketEmailEnabled();
  if (email.ok) {
    try {
      await sendPanelEmail({ to: email.to, subject: title, text });
    } catch (err) {
      console.error("[notifyTicketReplyExternal email]", err);
    }
  }

  if (await ticketTelegramEnabled()) {
    const r = await sendTelegramAlert(`${title}\n${text}`);
    if (!r.ok) console.error("[notifyTicketReplyExternal telegram]", r.error);
  }

  if (email.ok && opts.authorRole === PanelRole.ADMIN) {
    const creator = await prisma.panelUser.findUnique({
      where: { id: opts.ticketCreatedById },
      select: { email: true, username: true },
    });
    const resellerTo = String(creator?.email ?? "").trim();
    if (resellerTo && resellerTo.includes("@")) {
      try {
        await sendPanelEmail({
          to: resellerTo,
          subject: title,
          text: `Your ticket "${opts.subject}" has a new reply.\n\n${text}`,
        });
      } catch (err) {
        console.error("[notifyTicketReplyExternal reseller email]", err);
      }
    }
  }
}
