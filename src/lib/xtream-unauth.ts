import { isIpHost, pickPublicOrigin } from "./public-origin";
import { userAgentUsesStandardIptvPorts } from "./live-http-range";

/** Prefer configured LB media host when FORCE_LB / MEDIA_ORIGIN is set (match auth=1 advertise). */
function unauthStreamHost(panelOrigin: string): {
  host: string;
  useHttps: boolean;
  httpMediaEdge: boolean;
} {
  const forceLb = /^(1|true|yes)$/i.test(String(process.env.NEXLIFY_MEDIA_FORCE_LB_IP || "").trim());
  const configured = String(process.env.NEXLIFY_MEDIA_ORIGIN || "").trim();
  if (configured) {
    try {
      const u = new URL(configured.includes("://") ? configured : `http://${configured}`);
      if (u.hostname) {
        const useHttps = u.protocol.replace(":", "") === "https";
        // Only treat bare IP http origins as "http media edge" (https_port=80).
        const httpMediaEdge = !useHttps && (forceLb || isIpHost(u.hostname));
        return { host: u.hostname, useHttps, httpMediaEdge };
      }
    } catch {
      /* fall through */
    }
  }
  let streamHost = "localhost";
  try {
    const u = new URL(panelOrigin.includes("://") ? panelOrigin : `http://${panelOrigin}`);
    streamHost = u.hostname;
  } catch {
    streamHost = panelOrigin.replace(/^https?:\/\//, "").split("/")[0].split(":")[0] || "localhost";
  }
  const useHttps = !forceLb && panelOrigin.startsWith("https");
  return {
    host: streamHost,
    useHttps,
    httpMediaEdge: forceLb || (!useHttps && isIpHost(streamHost)),
  };
}

/** XUI-style 200 + auth:0 body. Smarters Pro (LG) treats HTTP 400 as "Authorization failed at host". */
export function xtreamUnauthPayload(panelBaseUrl: string, userAgent?: string | null) {
  const origin = pickPublicOrigin(
    panelBaseUrl,
    process.env.NEXT_PUBLIC_WEBSITE_URL || process.env.NEXT_PUBLIC_SERVER_URL
  ).replace(/\/+$/, "");
  const { host: streamHost, useHttps: originHttps, httpMediaEdge } = unauthStreamHost(origin);
  const standardPorts = userAgentUsesStandardIptvPorts(userAgent);
  const useHttps = httpMediaEdge ? false : originHttps || (!standardPorts && origin.startsWith("https"));
  // Domain TLS hosts must advertise 443 — never https_port=80 (breaks https://host:80).
  const httpsPort = httpMediaEdge ? "80" : "443";
  return {
    user_info: {
      auth: 0 as const,
      status: "Disabled",
      message: "Invalid credentials",
    },
    server_info: {
      url: streamHost,
      port: "80",
      https_port: httpsPort,
      server_protocol: useHttps ? "https" : "http",
      rtmp_port: "0",
      timezone: "Europe/London",
      timestamp_now: Math.floor(Date.now() / 1000),
    },
  };
}
