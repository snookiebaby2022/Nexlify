/**
 * Extract playable URLs from XUI/XC `stream_source` (JSON array, PHP serialize, plain URL).
 * Preserves credentials embedded in URLs (user:pass@host). Does not strip or redact.
 */

import {
  looksLikePhpSerialized,
  looksLikePlayableUrl,
  urlsFromPhpSerialized,
} from "./sql-junctions";

export type StreamSourceUrls = {
  primary: string;
  backup?: string;
  /** Sources beyond primary + backup (kept for migration parity with multi-source arrays). */
  extras: string[];
};

/** Placeholder so catalog rows without a playable URL are still imported (bouquets / episodes). */
export function pendingStreamUrl(legacyId: string, source = "xui"): string {
  const id = String(legacyId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `pending://${source}/${id}`;
}

export function isPendingStreamUrl(url: string): boolean {
  return /^pending:\/\//i.test(String(url ?? "").trim());
}

/** XUI often stores empty sources as 0 / "0" / [] — never treat those as URLs. */
export function isUsableStreamUrl(val: unknown): boolean {
  if (val == null) return false;
  if (typeof val === "number") return false;
  const s = String(val).trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  if (lower === "0" || lower === "null" || lower === "undefined" || lower === "false") {
    return false;
  }
  if (s === "[]" || s === "{}" || s === '[""]' || s === "['']") return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return false;
  if (looksLikePhpSerialized(s)) return false;
  return looksLikePlayableUrl(s);
}

function fromUrlList(urls: string[]): StreamSourceUrls {
  const usable = urls.map((u) => u.trim()).filter((u) => isUsableStreamUrl(u));
  if (!usable.length) return { primary: "", extras: [] };
  return {
    primary: usable[0],
    backup: usable[1],
    extras: usable.slice(2),
  };
}

/** Merge several source lists into primary / backup / extras (deduped, order preserved). */
export function mergeStreamSourceUrls(...parts: StreamSourceUrls[]): StreamSourceUrls {
  const seen = new Set<string>();
  const all: string[] = [];
  for (const p of parts) {
    for (const u of [p.primary, p.backup, ...p.extras]) {
      if (!u || seen.has(u)) continue;
      seen.add(u);
      all.push(u);
    }
  }
  return fromUrlList(all);
}

/** Parse stream_source / source / url fields into primary, backup, and remaining extras. */
export function streamUrlsFromSource(val: unknown): StreamSourceUrls {
  if (val == null || val === "") return { primary: "", extras: [] };
  if (typeof val === "number" && val === 0) return { primary: "", extras: [] };

  if (typeof val === "string") {
    const php = urlsFromPhpSerialized(val);
    if (php.length) return fromUrlList(php);
  }

  const s0 = typeof val === "string" ? val.trim() : null;
  if (s0 && (s0.startsWith("[") || s0.startsWith("{"))) {
    try {
      const parsed = JSON.parse(s0);
      if (Array.isArray(parsed)) {
        return fromUrlList(parsed.map((x) => String(x ?? "")));
      }
      if (parsed && typeof parsed === "object") {
        // Some panels nest sources under keys
        const obj = parsed as Record<string, unknown>;
        const nested =
          obj.sources ?? obj.source ?? obj.urls ?? obj.stream_source ?? obj.current_source;
        if (nested != null) return streamUrlsFromSource(nested);
      }
    } catch {
      /* fall through */
    }
  }

  if (Array.isArray(val)) {
    return fromUrlList(val.map((x) => String(x ?? "")));
  }

  if (!isUsableStreamUrl(val) && val != null && typeof val !== "object") {
    const raw = String(val ?? "").trim();
    if (!raw.startsWith("[") && !raw.startsWith("{") && !looksLikePhpSerialized(raw)) {
      return { primary: "", extras: [] };
    }
  }

  if (isUsableStreamUrl(val)) return { primary: String(val).trim(), extras: [] };
  return { primary: "", extras: [] };
}

/** First non-empty source among candidates (avoids `??` treating numeric 0 as present). */
export function firstStreamUrl(...candidates: unknown[]): StreamSourceUrls {
  const found: StreamSourceUrls[] = [];
  for (const c of candidates) {
    const got = streamUrlsFromSource(c);
    if (got.primary) found.push(got);
  }
  if (!found.length) return { primary: "", extras: [] };
  return mergeStreamSourceUrls(...found);
}

/** Same shape as stream-add-form: extra sources beyond backup live in `bitrates` JSON. */
export function extraSourcesToBitrates(extras: string[] | undefined):
  | { id: string; label: string; path: string; isPrimary: boolean }[]
  | undefined {
  if (!extras?.length) return undefined;
  return extras.map((url, i) => ({
    id: `migrated-src-${i + 2}`,
    label: `Source ${i + 3}`,
    path: url,
    isPrimary: false,
  }));
}

/** Stable key so the same dump URL matches a panel row after whitespace / host-case drift. */
export function normalizeMigrationStreamUrl(url: string): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  if (isPendingStreamUrl(raw)) return raw.toLowerCase();
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    u.protocol = u.protocol.toLowerCase();
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return raw;
  }
}

/**
 * Identity keys for skip-existing reimports: exact URL, normalized URL,
 * and pending:// placeholders from an earlier incomplete import of the same dump id.
 */
export function migrationStreamIdentityKeys(opts: {
  streamUrl: string;
  legacyId?: string | null;
  channelId?: string | null;
  source?: string | null;
}): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const v = String(value ?? "").trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    keys.push(v);
  };
  add(opts.streamUrl);
  const normalized = normalizeMigrationStreamUrl(opts.streamUrl);
  if (normalized) add(normalized);
  const legacyId = opts.legacyId?.trim();
  if (legacyId) add(pendingStreamUrl(legacyId, opts.source || "xui"));
  return keys;
}

export type MigrationStreamFillFields = {
  streamUrl: string;
  categoryId: string | null;
  serverId: string | null;
  backupUrl: string | null;
  streamIcon: string | null;
  containerExtension: string | null;
  epgChannelId: string | null;
  channelId: string | null;
};

/** Additive skip-existing: copy dump values only onto empty / pending panel fields. */
export function fillMissingStreamFields(
  existing: MigrationStreamFillFields,
  dump: MigrationStreamFillFields
): Partial<MigrationStreamFillFields> {
  const patch: Partial<MigrationStreamFillFields> = {};
  const dumpReal = Boolean(dump.streamUrl) && !isPendingStreamUrl(dump.streamUrl);
  const existingEmpty = !existing.streamUrl || isPendingStreamUrl(existing.streamUrl);
  if (dumpReal && existingEmpty) patch.streamUrl = dump.streamUrl;
  if (!existing.categoryId && dump.categoryId) patch.categoryId = dump.categoryId;
  if (!existing.serverId && dump.serverId) patch.serverId = dump.serverId;
  if (!existing.backupUrl && dump.backupUrl) patch.backupUrl = dump.backupUrl;
  if (!existing.streamIcon && dump.streamIcon) patch.streamIcon = dump.streamIcon;
  if (!existing.containerExtension && dump.containerExtension) {
    patch.containerExtension = dump.containerExtension;
  }
  if (!existing.epgChannelId && dump.epgChannelId) patch.epgChannelId = dump.epgChannelId;
  if (!existing.channelId && dump.channelId) patch.channelId = dump.channelId;
  return patch;
}
