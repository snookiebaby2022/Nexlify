import { pickPublicOrigin } from "./public-origin";
import { userAgentUsesStandardIptvPorts } from "./live-http-range";

/** Prefer configured LB media host when FORCE_LB / MEDIA_ORIGIN is set (match auth=1 advertise). */
function unauthStreamHost(panelOrigin: string): { host: string; httpMediaEdge: boolean } {
  const forceLb = /^(1|true|yes)$/i.test(String(process.env.NEXLIFY_MEDIA_FORCE_LB_IP || "").trim());
  const configured = String(process.env.NEXLIFY_MEDIA_ORIGIN || "").trim();
  if (configured) {
    try {
      const u = new URL(configured.includes("://") ? configured : `http://${configured}`);
      if (u.hostname) {
        return { host: u.hostname, httpMediaEdge: u.protocol.replace(":", "") !== "https" };
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
  return { host: streamHost, httpMediaEdge: forceLb };
}

/** XUI-style 200 + auth:0 body. Smarters Pro (LG) treats HTTP 400 as "Authorization failed at host". */
export function xtreamUnauthPayload(panelBaseUrl: string, userAgent?: string | null) {
  const origin = pickPublicOrigin(
    panelBaseUrl,
    process.env.NEXT_PUBLIC_WEBSITE_URL || process.env.NEXT_PUBLIC_SERVER_URL
  ).replace(/\/+$/, "");
  const { host: streamHost, httpMediaEdge } = unauthStreamHost(origin);
  const standardPorts = userAgentUsesStandardIptvPorts(userAgent);
  const useHttps = httpMediaEdge ? false : standardPorts ? false : origin.startsWith("https");
  // HTTP media edge has no usable :443 — mirror auth=1 port table.
  const httpsPort = httpMediaEdge || standardPorts ? "80" : "443";
  return {
    user_info: {
      auth: 0 as const,
      status: "Disabled",
      message: "Invalid credentials",
    },
    server_info: {
      url: streamHost,
      port: useHttps ? "443" : "80",
      https_port: httpsPort,
      server_protocol: useHttps ? "https" : "http",
      rtmp_port: "0",
      timezone: "Europe/London",
      timestamp_now: Math.floor(Date.now() / 1000),
    },
  };
}
