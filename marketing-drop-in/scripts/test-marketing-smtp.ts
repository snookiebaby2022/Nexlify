/**
 * Send a test email using marketing SMTP settings.
 * Run: cd /var/www/nexlify && npx tsx scripts/test-marketing-smtp.ts you@example.com
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveSmtpConfig, sendMarketingEmail } from "../src/lib/mail";

for (const p of [resolve(process.cwd(), ".env"), "/var/www/nexlify/.env"]) {
  if (existsSync(p)) config({ path: p, override: true });
}

async function main() {
  const arg = process.argv[2]?.trim();
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const to =
    arg ||
    adminEmail ||
    (smtpUser && smtpUser.includes("@") ? smtpUser : "");

  if (!to || !to.includes("@")) {
    console.error(
      "Usage: npx tsx scripts/test-marketing-smtp.ts recipient@email.com\n" +
        "  (Resend uses SMTP_USER=resend — pass your inbox as the argument)"
    );
    process.exit(1);
  }

  const smtp = resolveSmtpConfig();
  if (!smtp) {
    console.error("SMTP not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS in .env");
    process.exit(1);
  }

  console.log(`Sending test via ${smtp.host}:${smtp.port} as ${smtp.user} → ${to}`);

  await sendMarketingEmail({
    to,
    subject: "Nexlify marketing SMTP test",
    text: "If you received this, marketing SMTP is working.",
    html: "<p>If you received this, <strong>marketing SMTP</strong> is working.</p>",
  });

  console.log("OK — test email sent");
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
