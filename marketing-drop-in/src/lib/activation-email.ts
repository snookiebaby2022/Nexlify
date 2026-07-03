import { sendMarketingEmail } from "@/lib/mail";

export async function sendActivationCodeEmail(
  to: string,
  name: string | null,
  code: string,
  licenseId: string
): Promise<{ ok: boolean; delivered: boolean }> {
  const displayName = name?.trim() || "there";

  const html = `
<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px">
  <h2 style="color:#1a1a2e">Your Nexlify Activation Code</h2>
  <p>Hi ${displayName},</p>
  <p>Your activation code for license <code>${licenseId}</code>:</p>
  <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:24px;background:#f4f2ff;border-radius:12px;color:#7c3aed">${code}</div>
  <p>Enter this code in your Nexlify panel to activate your license.</p>
  <p style="color:#666;font-size:13px">This code expires in 15 minutes. If you didn't request this, ignore this email.</p>
</div>`;

  const text = `Hi ${displayName},\n\nYour activation code for license ${licenseId}:\n\n${code}\n\nEnter this code in your Nexlify panel to activate your license.\n\nThis code expires in 15 minutes.`;

  try {
    await sendMarketingEmail({
      to,
      subject: `Your Nexlify Activation Code — ${licenseId}`,
      text,
      html,
    });
    return { ok: true, delivered: true };
  } catch (e) {
    console.error("[activation-email] Failed to send:", e);
    return { ok: true, delivered: false };
  }
}
