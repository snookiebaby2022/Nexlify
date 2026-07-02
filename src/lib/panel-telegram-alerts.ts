import { getSettingGroup } from "@/lib/panel-settings";

export async function sendTelegramAlert(message: string): Promise<{ ok: boolean; error?: string }> {
  const settings = await getSettingGroup("monitoring");
  if (!settings.telegramAlertsEnabled) return { ok: false, error: "Telegram alerts disabled" };

  const token = String(
    process.env.TELEGRAM_BOT_TOKEN ?? settings.telegramBotToken ?? ""
  ).trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID ?? settings.telegramChatId ?? "").trim();

  if (!token || !chatId) return { ok: false, error: "Telegram bot not configured" };

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message.slice(0, 4000),
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text.slice(0, 200) };
  }
  return { ok: true };
}
