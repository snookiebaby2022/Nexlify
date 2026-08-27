import { prisma } from "@/lib/prisma";
import { sendMarketingEmail } from "@/lib/mail";
import { formatTicketRef } from "@/lib/tickets";

function siteOrigin(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXLIFY_MARKETING_URL?.trim() ||
    "https://nexlify.live";
  return fromEnv.replace(/\/$/, "");
}

async function adminNotifyEmails(): Promise<string[]> {
  const fromDb = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { email: true },
  });
  const emails = new Set(
    fromDb.map((u) => u.email.trim().toLowerCase()).filter(Boolean)
  );

  for (const key of ["SUPPORT_NOTIFY_EMAIL", "ADMIN_EMAIL"] as const) {
    const v = process.env[key]?.trim();
    if (v) emails.add(v.toLowerCase());
  }

  return [...emails];
}

export type TicketAdminNotifyKind = "new" | "customer_reply";

/** Best-effort email to admins when a customer opens or replies to a ticket. */
export async function notifyAdminsOfTicketEvent(opts: {
  kind: TicketAdminNotifyKind;
  ticketId: string;
  subject: string;
  priority?: string;
  customerEmail: string;
  preview?: string;
}): Promise<void> {
  try {
    const recipients = await adminNotifyEmails();
    if (recipients.length === 0) {
      console.warn("[ticket-notify] no admin emails configured");
      return;
    }

    const ref = formatTicketRef(opts.ticketId);
    const url = `${siteOrigin()}/admin/tickets`;
    const threadUrl = `${siteOrigin()}/support/${opts.ticketId}`;
    const preview = (opts.preview ?? "").trim().slice(0, 280);
    const title =
      opts.kind === "new"
        ? `New support ticket ${ref}`
        : `Customer reply on ${ref}`;

    const text = [
      title,
      "",
      `From: ${opts.customerEmail}`,
      `Subject: ${opts.subject}`,
      opts.priority ? `Priority: ${opts.priority}` : null,
      preview ? `\nMessage:\n${preview}` : null,
      "",
      `Admin tickets: ${url}`,
      `Thread: ${threadUrl}`,
    ]
      .filter((line) => line != null)
      .join("\n");

    const html = `
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0c0818;color:#e2e8f0">
  <h2 style="color:#c4b5fd;margin:0 0 12px">${title}</h2>
  <p style="margin:0 0 8px"><strong>From:</strong> ${opts.customerEmail}</p>
  <p style="margin:0 0 8px"><strong>Subject:</strong> ${opts.subject}</p>
  ${opts.priority ? `<p style="margin:0 0 8px"><strong>Priority:</strong> ${opts.priority}</p>` : ""}
  ${preview ? `<div style="margin:16px 0;padding:12px;border-radius:8px;background:#1e1b2e;white-space:pre-wrap;font-size:14px">${preview.replace(/</g, "&lt;")}</div>` : ""}
  <p style="margin:20px 0 0">
    <a href="${url}" style="display:inline-block;padding:10px 16px;border-radius:999px;background:#7c3aed;color:#fff;text-decoration:none;font-weight:600">Open tickets</a>
  </p>
</div>`;

    await Promise.allSettled(
      recipients.map((to) =>
        sendMarketingEmail({
          to,
          subject: `[Nexlify] ${title} — ${opts.subject}`,
          text,
          html,
        })
      )
    );
  } catch (e) {
    console.error("[ticket-notify] failed", e);
  }
}
