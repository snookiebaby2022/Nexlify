/** Plain-language fix steps for stream probe / auto-disable messages shown in Stream logs & errors. */
export function streamProbeFixHint(message: string | null | undefined): string {
  const raw = (message ?? "").trim();
  if (!raw) return "Open the stream under Manage Streams, verify the Source URL, then run Full probe.";

  const m = raw.toLowerCase();

  if (m.includes("timed out")) {
    return "The panel could not reach the source in time. Check the stream URL, provider uptime, firewall/outbound IP whitelist, and run Full probe (not Fast). Test the same URL in VLC from the server.";
  }
  if (m.includes("http 503") || m.includes("server error http 5")) {
    return "The upstream returned a server error (503/5xx). The provider may be overloaded or in maintenance. Wait and retry, set a Backup URL, or contact your provider.";
  }
  if (m.includes("head failed") || m.includes("fast probe")) {
    return "Fast probe uses HEAD and many IPTV sources block it. Edit the stream → Probe → Full probe, or test in VLC. If Full probe works, re-enable the channel.";
  }
  if (
    m.includes("network unreachable") ||
    m.includes("host not found") ||
    m.includes("enotfound") ||
    m.includes("dns")
  ) {
    return "The panel cannot resolve or reach that host. Check DNS, outbound proxy (Admin → Proxies), server firewall, and geo-blocks against your panel IP.";
  }
  if (m.includes("connection refused") || m.includes("econnrefused")) {
    return "Nothing is listening on that host/port. Verify the port in the stream URL and that the provider feed is online.";
  }
  if (m.includes("connection reset") || m.includes("econnreset")) {
    return "The upstream closed the connection. Often a bad/expired URL, rate limit, or IP block — try backup URL or provider support.";
  }
  if (m.includes("tls") || m.includes("ssl") || m.includes("certificate")) {
    return "HTTPS certificate problem on the source. Fix the provider cert or use an http URL if the provider allows it.";
  }
  if (m.includes("auth required") || m.includes("http 401") || m.includes("http 403")) {
    return "URL is reachable but credentials are wrong or expired. Update username/password in the stream source URL.";
  }
  if (m.includes("auto-disabled")) {
    return "Cron disabled this after repeated probe failures. Fix the source URL, run Full probe until Online, then Activate the stream again.";
  }
  if (m.includes("url is empty")) {
    return "No source URL is set. Edit the stream and add a valid http(s) stream_source URL.";
  }

  return "Edit the stream, confirm the Source URL works in VLC from the panel server, run Full probe, then Activate if it was disabled.";
}

/** Append a short fix line for storage in probe error fields (optional). */
export function streamProbeErrorWithHint(message: string | null | undefined): string {
  const base = (message ?? "").trim();
  const hint = streamProbeFixHint(base);
  if (!base) return hint;
  if (base.includes("Fix:")) return base;
  return `${base} — Fix: ${hint}`;
}
