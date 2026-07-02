import nodemailer from "nodemailer";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

export function resolveSmtpConfig(): SmtpConfig | null {
  const host = String(process.env.SMTP_HOST ?? "").trim();
  const user = String(process.env.SMTP_USER ?? "").trim();
  const pass = String(process.env.SMTP_PASS ?? "").trim();
  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);
  const from =
    String(process.env.SMTP_FROM ?? "").trim() ||
    (user.includes("@") ? `Nexlify <${user}>` : `Nexlify <noreply@nexlify.live>`);

  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure: port === 465,
    user,
    pass,
    from,
  };
}

export async function sendMarketingEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const smtp = resolveSmtpConfig();
  if (!smtp) {
    throw new Error("SMTP is not configured");
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
  });
}
