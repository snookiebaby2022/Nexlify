/**
 * Forward panel suggestions/reports to the Nexlify marketing admin (vendor).
 * Uses NEXLIFY_VENDOR_FEEDBACK_URL when set, else https://nexlify.live/api/panel-feedback.
 */
export async function forwardPanelFeedbackToVendor(opts: {
  kind: "SUGGESTION" | "REPORT" | "BUG" | "SUPPORT";
  subject: string;
  body: string;
  panelHost?: string | null;
  username?: string | null;
}): Promise<{ ok: boolean; detail?: string }> {
  const url =
    process.env.NEXLIFY_VENDOR_FEEDBACK_URL?.trim() ||
    process.env.NEXT_PUBLIC_VENDOR_FEEDBACK_URL?.trim() ||
    "https://nexlify.live/api/panel-feedback";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.NEXLIFY_VENDOR_FEEDBACK_KEY
          ? { Authorization: `Bearer ${process.env.NEXLIFY_VENDOR_FEEDBACK_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        kind: opts.kind,
        subject: opts.subject,
        body: opts.body,
        panelHost: opts.panelHost ?? process.env.PANEL_PRIMARY_DOMAIN ?? null,
        username: opts.username ?? null,
        source: "nexlify-panel",
        createdAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, detail: `HTTP ${res.status} ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
