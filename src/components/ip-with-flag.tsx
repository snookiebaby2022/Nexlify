"use client";

import { useEffect, useState } from "react";
import {
  countryCodeToFlag,
  extractIpAddress,
  isPublicIp,
  normalizeCountryCode,
} from "@/lib/ip-country";

const lookupCache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

async function fetchCountryCode(ip: string): Promise<string | null> {
  const cached = lookupCache.get(ip);
  if (cached !== undefined) return cached;

  let pending = inflight.get(ip);
  if (!pending) {
    pending = fetch(`/api/admin/ip-country?ip=${encodeURIComponent(ip)}`)
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { countryCode?: string | null };
        return normalizeCountryCode(data.countryCode);
      })
      .catch(() => null)
      .finally(() => {
        inflight.delete(ip);
      });
    inflight.set(ip, pending);
  }

  const code = await pending;
  lookupCache.set(ip, code);
  return code;
}

export function CountryFlag({
  code,
  className = "",
  title,
}: {
  code: string | null | undefined;
  className?: string;
  title?: string;
}) {
  const cc = normalizeCountryCode(code);
  if (!cc) return null;
  const lowCc = cc.toLowerCase();
  return (
    <img
      src={`https://flagcdn.com/16x12/${lowCc}.png`}
      srcSet={`https://flagcdn.com/32x24/${lowCc}.png 2x`}
      width="16"
      height="12"
      alt={title ?? cc}
      title={title ?? cc}
      className={`inline-block shrink-0 align-middle rounded-sm ${className}`.trim()}
      style={{ verticalAlign: "middle" }}
    />
  );
}

export function IpWithFlag({
  ip,
  showCode = false,
  className = "",
  countryCode,
  mono = true,
}: {
  ip: string;
  showCode?: boolean;
  className?: string;
  /** When set, skips geo lookup (e.g. proxy list already has country). */
  countryCode?: string | null;
  mono?: boolean;
}) {
  const text = ip?.trim() || "—";
  const literalIp = extractIpAddress(text);
  const preset = normalizeCountryCode(countryCode);
  const [resolved, setResolved] = useState<string | null>(preset);
  const canLookup = Boolean(literalIp && isPublicIp(literalIp) && !preset);

  useEffect(() => {
    if (preset) {
      setResolved(preset);
      return;
    }
    if (!canLookup || !literalIp) {
      setResolved(null);
      return;
    }

    let cancelled = false;
    fetchCountryCode(literalIp).then((code) => {
      if (!cancelled) setResolved(code);
    });
    return () => {
      cancelled = true;
    };
  }, [preset, canLookup, literalIp]);

  const displayCode = preset ?? resolved;

  return (
    <span
      className={`inline-flex items-center gap-1.5 max-w-full ${className}`.trim()}
    >
      <CountryFlag code={displayCode} className="text-[1.05rem]" />
      <span className={mono ? "font-mono text-xs" : "text-xs"}>{text}</span>
      {showCode && displayCode && (
        <span className="text-[10px] uppercase" style={{ color: "var(--muted)" }}>
          {displayCode}
        </span>
      )}
    </span>
  );
}
