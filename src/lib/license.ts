import { prisma } from "@/lib/prisma";

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

export function durationDaysToTerm(days: number): string {
  if (days <= 0 || days >= 36500) return "unlimited";
  if (days <= 35) return "1m";
  if (days <= 100) return "3m";
  if (days <= 200) return "6m";
  return "1y";
}

function licenseApiBase(): string {
  const url = process.env.NEXLIFY_LICENSE_API_URL?.trim().replace(/\/$/, "");
  if (!url) {
    throw new Error("NEXLIFY_LICENSE_API_URL is not configured");
  }
  return url;
}

/** Issue a signed NXLF1 key from the license server. */
export async function requestLicenseKey(opts: {
  email: string;
  durationDays?: number;
  term?: string;
}): Promise<string> {
  const secret = process.env.LICENSE_SERVER_API_SECRET?.trim() ?? "";
  const term =
    opts.term?.trim() ||
    durationDaysToTerm(opts.durationDays ?? 365);
  let res: Response;
  try {
    res = await fetch(`${licenseApiBase()}/v1/issue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({
        email: opts.email,
        term,
        bind: true,
      }),
      cache: "no-store",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Network error";
    throw new Error(`License server unreachable (${message})`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      "License server misconfigured — NEXLIFY_LICENSE_API_URL must point to the license API (http://127.0.0.1:8787 on this server), not the marketing website",
    );
  }

  const data = (await res.json()) as {
    ok?: boolean;
    license_key?: string;
    error?: string;
  };

  if (!res.ok || !data.ok || !data.license_key) {
    throw new Error(data.error ?? "License server rejected the request");
  }

  return data.license_key;
}

/** @deprecated Use requestLicenseKey — kept for call sites being migrated. */
export async function generateLicenseKey(email: string, durationDays: number): Promise<string> {
  return requestLicenseKey({ email, durationDays });
}

export async function uniqueLicenseKey(
  email: string,
  durationDays: number,
  term?: string
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const key = await requestLicenseKey({ email, durationDays, term });
    const existing = await prisma.license.findUnique({ where: { key } });
    if (!existing) return key;
  }
  throw new Error("Failed to generate a unique license key");
}
