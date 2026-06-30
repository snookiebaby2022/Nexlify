import nodemailer from "nodemailer";
import { getSettingGroup } from "@/lib/panel-settings";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

export type PanelEmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export async function resolveSmtpConfig(): Promise<SmtpConfig | null> {
  const notifications = await getSettingGroup("notifications");
  const host = String(process.env.SMTP_HOST ?? notifications.smtpHost ?? "").trim();
  const user = String(process.env.SMTP_USER ?? notifications.smtpUser ?? "").trim();
  const pass = String(process.env.SMTP_PASS ?? notifications.smtpPassword ?? "").trim();
  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT ?? notifications.smtpPort ?? 587);
  const from =
    String(process.env.SMTP_FROM ?? "").trim() ||
    (user.includes("@") ? `Nexlify Panel <${user}>` : `Nexlify Panel <${user}@${host}>`);

  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure: port === 465,
    user,
    pass,
    from,
  };
}

export function panelReportRecipient(): string {
  return (
    process.env.PANEL_REPORT_EMAIL?.trim() ||
    process.env.PANEL_OWNER_EMAIL?.trim() ||
    ""
  );
}

export async function sendPanelEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: PanelEmailAttachment[];
}): Promise<void> {
  const smtp = await resolveSmtpConfig();
  if (!smtp) {
    throw new Error(
      "Email is not configured. Set SMTP in Admin → Settings → Notifications, or add SMTP_HOST, SMTP_USER, and SMTP_PASS to the panel .env."
    );
  }

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  await transport.sendMail({
    from: smtp.from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html ?? opts.text.replace(/\n/g, "<br>"),
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
}
