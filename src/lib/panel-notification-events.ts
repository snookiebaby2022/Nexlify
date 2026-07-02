import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { sendPanelEmail } from "@/lib/panel-email";
import { sendPanelSms } from "@/lib/panel-sms";
import { PanelNotificationKind, PanelNotificationPriority, PanelNotificationTarget } from "@prisma/client";

async function createInPanelAlert(opts: {
  title: string;
  body: string;
  recipientId?: string;
  priority?: PanelNotificationPriority;
}) {
  const settings = await getSettingGroup("notifications");
  if (!settings.inPanelAlerts) return;

  const admin = await prisma.panelUser.findFirst({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  if (!admin) return;

  await prisma.panelNotification.create({
    data: {
      title: opts.title,
      body: opts.body,
      kind: PanelNotificationKind.ALERT,
      priority: opts.priority ?? PanelNotificationPriority.NORMAL,
      target: opts.recipientId
        ? PanelNotificationTarget.SPECIFIC_USER
        : PanelNotificationTarget.ALL_RESELLERS,
      recipientId: opts.recipientId ?? null,
      createdById: admin.id,
    },
  });
}

async function notifyEmailTo(subject: string, text: string, html: string | undefined, to: string) {
  const settings = await getSettingGroup("notifications");
  if (!settings.emailEnabled) return;
  const recipient = to.trim();
  if (!recipient) return;
  try {
    await sendPanelEmail({ to: recipient, subject, text, html });
  } catch {
    /* SMTP optional */
  }
}

async function notifyEmail(subject: string, text: string, to?: string) {
  const settings = await getSettingGroup("notifications");
  if (!settings.emailEnabled) return;
  const recipient = String(to ?? settings.notifyEmail ?? "").trim();
  if (!recipient) return;
  await notifyEmailTo(subject, text, undefined, recipient);
}

async function notifySms(text: string, phone?: string) {
  const settings = await getSettingGroup("notifications");
  if (!settings.smsEnabled) return;
  const to = String(phone ?? settings.resellerNotifyPhone ?? "").trim();
  if (!to) return;
  await sendPanelSms(to, text);
}

export async function notifyLineWelcome(opts: {
  lineId: string;
  panelUrl: string;
  clientEmail?: string | null;
}) {
  const settings = await getSettingGroup("notifications");
  if (!settings.notifyNewLine && !opts.clientEmail) return;

  const line = await prisma.line.findUnique({
    where: { id: opts.lineId },
    include: { owner: { select: { email: true, username: true } } },
  });
  if (!line) return;

  const m3uUrl = `${opts.panelUrl.replace(/\/$/, "")}/get.php?username=${encodeURIComponent(line.username)}&password=${encodeURIComponent(line.password)}&type=m3u_plus&output=ts`;
  const portalUrl = `${opts.panelUrl.replace(/\/$/, "")}/portal`;
  const subject = `Your IPTV subscription — ${line.username}`;
  const text = [
    `Username: ${line.username}`,
    `Password: ${line.password}`,
    `Expires: ${line.expiresAt.toISOString().slice(0, 10)}`,
    `M3U: ${m3uUrl}`,
    `Portal: ${portalUrl}`,
  ].join("\n");
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px">
      <h2 style="color:#0ea5e9">Your IPTV subscription is ready</h2>
      <p><strong>Username:</strong> ${line.username}<br/>
      <strong>Password:</strong> ${line.password}<br/>
      <strong>Expires:</strong> ${line.expiresAt.toISOString().slice(0, 10)}</p>
      <p><a href="${m3uUrl}">Download M3U playlist</a> · <a href="${portalUrl}">Subscriber portal</a></p>
    </div>`;

  if (settings.notifyNewLine && line.owner?.email) {
    await notifyEmailTo(`[Nexlify] New line ${line.username}`, text, html, line.owner.email);
  }
  if (opts.clientEmail?.trim()) {
    await notifyEmailTo(subject, text, html, opts.clientEmail.trim());
  }
}

export async function notifyLineExpiry(lineId: string, daysLeft: number) {
  const settings = await getSettingGroup("notifications");
  if (!settings.notifyExpiry) return;

  const line = await prisma.line.findUnique({
    where: { id: lineId },
    include: { owner: { select: { id: true, email: true } } },
  });
  if (!line) return;

  const msg = `Line ${line.username} expires in ${daysLeft} day(s) (${line.expiresAt.toISOString().slice(0, 10)}).`;
  await createInPanelAlert({
    title: "Subscription expiring",
    body: msg,
    recipientId: line.ownerId ?? undefined,
    priority: daysLeft <= 1 ? PanelNotificationPriority.URGENT : PanelNotificationPriority.HIGH,
  });
  await notifyEmail(`[Nexlify] ${msg}`, msg, line.owner?.email ?? undefined);
  if (settings.smsNotifyExpiry) await notifySms(msg);
}

export async function notifyLineRenewal(lineId: string) {
  const settings = await getSettingGroup("notifications");
  if (!settings.notifyRenewal) return;

  const line = await prisma.line.findUnique({
    where: { id: lineId },
    include: { owner: { select: { id: true, email: true } } },
  });
  if (!line) return;

  const msg = `Line ${line.username} was renewed until ${line.expiresAt.toISOString().slice(0, 10)}.`;
  await createInPanelAlert({ title: "Subscription renewed", body: msg, recipientId: line.ownerId ?? undefined });
  await notifyEmail(`[Nexlify] ${msg}`, msg, line.owner?.email ?? undefined);
  if (settings.smsNotifyRenewal) await notifySms(msg);
}

export async function notifyLineSuspension(lineId: string, reason: string) {
  const settings = await getSettingGroup("notifications");
  if (!settings.notifySuspension) return;

  const line = await prisma.line.findUnique({
    where: { id: lineId },
    include: { owner: { select: { id: true, email: true } } },
  });
  if (!line) return;

  const msg = `Line ${line.username} suspended: ${reason}`;
  await createInPanelAlert({
    title: "Subscription suspended",
    body: msg,
    recipientId: line.ownerId ?? undefined,
    priority: PanelNotificationPriority.URGENT,
  });
  await notifyEmail(`[Nexlify] ${msg}`, msg, line.owner?.email ?? undefined);
  if (settings.smsNotifySuspension) await notifySms(msg);
}

export async function notifyLowCredits(userId: string, credits: number) {
  const settings = await getSettingGroup("notifications");
  const threshold = Number(settings.notifyLowCreditThreshold ?? 50);
  if (!settings.notifyLowCredits || credits > threshold) return;

  const user = await prisma.panelUser.findUnique({ where: { id: userId } });
  if (!user) return;

  const msg = `Reseller ${user.username} has ${credits} credits remaining (threshold ${threshold}).`;
  await createInPanelAlert({
    title: "Low credits",
    body: msg,
    recipientId: userId,
    priority: PanelNotificationPriority.HIGH,
  });
  await notifyEmail(`[Nexlify] ${msg}`, msg, user.email ?? undefined);
  if (settings.smsNotifyLowCredit) await notifySms(msg, settings.resellerNotifyPhone as string);
}

/** Cron: check expiring lines and low-credit resellers. */
export async function runSubscriptionNotificationJob() {
  const settings = await getSettingGroup("notifications");
  const daysBefore = Number(settings.notifyExpiryDaysBefore ?? 3);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysBefore);

  const expiring = await prisma.line.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { lte: cutoff, gt: new Date() },
    },
    select: { id: true, expiresAt: true },
  });

  for (const line of expiring) {
    const daysLeft = Math.ceil((line.expiresAt.getTime() - Date.now()) / 86400000);
    await notifyLineExpiry(line.id, Math.max(1, daysLeft));
  }

  const threshold = Number(settings.notifyLowCreditThreshold ?? 50);
  const lowCredit = await prisma.panelUser.findMany({
    where: { role: { in: ["RESELLER", "SUB_RESELLER"] }, isActive: true, credits: { lte: threshold } },
    select: { id: true, credits: true },
  });
  for (const u of lowCredit) {
    await notifyLowCredits(u.id, u.credits);
  }

  return { expiring: expiring.length, lowCredit: lowCredit.length };
}
