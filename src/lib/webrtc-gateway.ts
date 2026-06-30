import type { WebRtcSettings } from "@/lib/webrtc-config";
import { buildWhepUrl, webrtcPathForStream } from "@/lib/webrtc-config";

export type WhepExchangeResult = {
  answerSdp: string;
  sessionUrl: string | null;
  whepUrl: string;
};

/** Ensure MediaMTX path exists for a live source (pull on demand). */
export async function ensureMediamtxPath(
  settings: WebRtcSettings,
  streamId: string,
  sourceUrl: string
): Promise<void> {
  const pathName = webrtcPathForStream(streamId, settings.webrtcPathPrefix);
  const api = `${settings.mediamtxApiUrl}/v3/config/paths/get/${encodeURIComponent(pathName)}`;
  try {
    const check = await fetch(api, { signal: AbortSignal.timeout(4000) });
    if (check.ok) return;
  } catch {
    /* create below */
  }

  const addUrl = `${settings.mediamtxApiUrl}/v3/config/paths/add/${encodeURIComponent(pathName)}`;
  const body = {
    source: sourceUrl,
    sourceOnDemand: true,
    sourceOnDemandStartTimeout: "10s",
    sourceOnDemandCloseAfter: "30s",
  };
  const res = await fetch(addUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok && res.status !== 409) {
    const text = await res.text().catch(() => "");
    throw new Error(`MediaMTX path setup failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

/** WHEP SDP offer/answer exchange with gateway (MediaMTX or compatible). */
export async function exchangeWhepOffer(
  whepUrl: string,
  offerSdp: string
): Promise<WhepExchangeResult> {
  const res = await fetch(whepUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/sdp",
      Accept: "application/sdp",
    },
    body: offerSdp,
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`WHEP gateway error ${res.status}: ${err.slice(0, 300)}`);
  }

  const answerSdp = await res.text();
  const location = res.headers.get("Location") ?? res.headers.get("location");
  let sessionUrl = location;
  if (sessionUrl && sessionUrl.startsWith("/")) {
    try {
      const base = new URL(whepUrl);
      sessionUrl = `${base.origin}${sessionUrl}`;
    } catch {
      /* keep relative */
    }
  }

  return { answerSdp, sessionUrl, whepUrl };
}

export async function teardownWhepSession(sessionUrl: string): Promise<void> {
  try {
    await fetch(sessionUrl, { method: "DELETE", signal: AbortSignal.timeout(5000) });
  } catch {
    /* best effort */
  }
}

export async function prepareStreamWhep(
  settings: WebRtcSettings,
  streamId: string,
  sourceUrl: string,
  serverHost?: string | null
): Promise<string> {
  if (settings.gatewayMode === "mediamtx") {
    await ensureMediamtxPath(settings, streamId, sourceUrl);
  }
  return buildWhepUrl(settings, streamId, serverHost);
}
