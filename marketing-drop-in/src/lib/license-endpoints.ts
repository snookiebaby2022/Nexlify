/** Display domain + IP endpoints for a license row in admin UI. */
export function licensePanelEndpoints(lic: {
  panelUrl: string | null;
  panelHost?: string | null;
}): { domain: string | null; ip: string | null } {
  let domain: string | null = null;
  let ip: string | null = null;

  const hostFromUrl = (() => {
    if (!lic.panelUrl) return null;
    try {
      return new URL(lic.panelUrl).hostname.toLowerCase();
    } catch {
      return null;
    }
  })();

  const isIp = (value: string) =>
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) || /^\[[\da-f:]+\]$/.test(value);

  const rawHost = String(lic.panelHost ?? "").trim().toLowerCase();
  if (rawHost) {
    if (isIp(rawHost)) ip = rawHost.startsWith("http") ? rawHost : `http://${rawHost}`;
    else domain = rawHost.startsWith("http") ? rawHost : `http://${rawHost}`;
  }

  if (hostFromUrl) {
    if (isIp(hostFromUrl)) {
      const ipUrl = lic.panelUrl!.replace(/\/$/, "");
      if (!ip || ip.replace(/\/$/, "") !== ipUrl) ip = ipUrl;
    } else if (!domain) {
      domain = lic.panelUrl!.replace(/\/$/, "");
    }
  }

  if (domain && ip) {
    const domainHost = (() => {
      try {
        return new URL(domain.startsWith("http") ? domain : `http://${domain}`).hostname;
      } catch {
        return domain;
      }
    })();
    if (domainHost === ip.replace(/^https?:\/\//, "").split("/")[0]) ip = null;
  }

  return { domain, ip };
}
