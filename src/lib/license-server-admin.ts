/** Push license status / binding changes to the vendor license server (port 8787). */

function licenseApiBase(): string | null {
  const url = process.env.NEXLIFY_LICENSE_API_URL?.trim().replace(/\/$/, "");
  return url || null;
}

function licenseSecret(): string {
  return process.env.LICENSE_SERVER_API_SECRET?.trim() ?? "";
}

async function postLicenseServer(path: string, body: Record<string, unknown>) {
  const base = licenseApiBase();
  if (!base) return { ok: false as const, error: "NEXLIFY_LICENSE_API_URL not set" };

  const secret = licenseSecret();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Network error";
    return { ok: false as const, error: message };
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { ok: false as const, error: `License server HTTP ${res.status}` };
  }

  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    return { ok: false as const, error: data.error ?? `License server HTTP ${res.status}` };
  }
  return { ok: true as const };
}

export async function setLicenseServerStatus(
  licenseKey: string,
  status: "ACTIVE" | "SUSPENDED" | "REVOKED"
) {
  return postLicenseServer("/v1/admin/status", { license_key: licenseKey, status });
}

export async function clearLicenseServerBinding(licenseKey: string) {
  return postLicenseServer("/v1/admin/clear-binding", { license_key: licenseKey });
}
