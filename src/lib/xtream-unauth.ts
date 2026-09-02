import { pickPublicOrigin } from "./public-origin";
import { userAgentUsesStandardIptvPorts } from "./live-http-range";

/** XUI-style 200 + auth:0 body. Smarters Pro (LG) treats HTTP 400 as "Authorization failed at host". */
export function xtreamUnauthPayload(panelBaseUrl: string, userAgent?: string | null) {
  const origin = pickPublicOrigin(
    panelBaseUrl,
    process.env.NEXT_PUBLIC_WEBSITE_URL || process.env.NEXT_PUBLIC_SERVER_URL
  ).replace(/\/+$/, "");
  let streamHost = "localhost";
  try {
    const u = new URL(origin.includes("://") ? origin : `http://${origin}`);
    streamHost = u.hostname;
  } catch {
    streamHost = origin.replace(/^https?:\/\//, "").split("/")[0].split(":")[0] || "localhost";
  }
  const standardPorts = userAgentUsesStandardIptvPorts(userAgent);
  const useHttps = standardPorts ? false : origin.startsWith("https");
  return {
    user_info: {
      auth: 0 as const,
      status: "Disabled",
      message: "Invalid credentials",
    },
    server_info: {
      url: streamHost,
      port: useHttps ? "443" : "80",
      https_port: standardPorts ? "80" : "443",
      server_protocol: useHttps ? "https" : "http",
      rtmp_port: "0",
      timezone: "Europe/London",
      timestamp_now: Math.floor(Date.now() / 1000),
    },
  };
}
