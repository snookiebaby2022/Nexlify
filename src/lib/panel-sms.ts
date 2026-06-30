import { getSettingGroup } from "@/lib/panel-settings";

export async function sendPanelSms(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const settings = await getSettingGroup("notifications");
  if (!settings.smsEnabled) return { ok: false, error: "SMS disabled" };

  const accountSid = String(
    process.env.TWILIO_ACCOUNT_SID ?? settings.twilioAccountSid ?? ""
  ).trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN ?? settings.twilioAuthToken ?? "").trim();
  const from = String(process.env.TWILIO_FROM_NUMBER ?? settings.twilioFromNumber ?? "").trim();
  const phone = to.replace(/\s/g, "");

  if (!accountSid || !authToken || !from || !phone) {
    return { ok: false, error: "Twilio not configured" };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const params = new URLSearchParams({ To: phone, From: from, Body: body.slice(0, 1600) });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text.slice(0, 200) };
  }
  return { ok: true };
}
