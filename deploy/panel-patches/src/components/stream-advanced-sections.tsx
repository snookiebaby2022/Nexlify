"use client";

import type { BitrateVariant } from "@/lib/stream-variants";
import type { DnsRotatorConfig } from "@/lib/dns-rotator";

export type StreamAdvancedState = {
  isShifted: boolean;
  timeshiftSeconds: string;
  parentStreamId: string;
  dnsRotatorMode: "round_robin" | "random";
  dnsRotatorHosts: string;
  bitrates: BitrateVariant[];
};

export const emptyAdvancedState = (): StreamAdvancedState => ({
  isShifted: false,
  timeshiftSeconds: "",
  parentStreamId: "",
  dnsRotatorMode: "round_robin",
  dnsRotatorHosts: "",
  bitrates: [],
});

export function advancedFromStream(stream: {
  isShifted?: boolean;
  timeshiftSeconds?: number | null;
  parentStreamId?: string | null;
  dnsRotator?: unknown;
  bitrates?: unknown;
}): StreamAdvancedState {
  const rotator = stream.dnsRotator as DnsRotatorConfig | null;
  const bitrates = Array.isArray(stream.bitrates)
    ? (stream.bitrates as BitrateVariant[])
    : [];
  return {
    isShifted: Boolean(stream.isShifted),
    timeshiftSeconds: stream.timeshiftSeconds != null ? String(stream.timeshiftSeconds) : "",
    parentStreamId: stream.parentStreamId ?? "",
    dnsRotatorMode: rotator?.mode === "random" ? "random" : "round_robin",
    dnsRotatorHosts: rotator?.hosts?.join("\n") ?? "",
    bitrates,
  };
}

export function advancedToPayload(adv: StreamAdvancedState) {
  const hosts = adv.dnsRotatorHosts
    .split(/[\n,]+/)
    .map((h) => h.trim())
    .filter(Boolean);
  const dnsRotator =
    hosts.length > 0 ? { mode: adv.dnsRotatorMode, hosts } : null;
  const bitrates = adv.bitrates.filter((b) => b.label && b.path);
  return {
    isShifted: adv.isShifted || (adv.timeshiftSeconds !== "" && Number(adv.timeshiftSeconds) > 0),
    timeshiftSeconds: adv.timeshiftSeconds !== "" ? Number(adv.timeshiftSeconds) : null,
    parentStreamId: adv.parentStreamId || null,
    dnsRotator,
    bitrates: bitrates.length ? bitrates : null,
  };
}

function sectionStyle() {
  return {
    borderColor: "var(--border)",
    background: "rgba(94,184,232,0.04)",
  };
}

export function StreamAdvancedSections({
  adv,
  setAdv,
  parentOptions,
  showShifted = true,
  showDns = true,
  showBitrates = true,
}: {
  adv: StreamAdvancedState;
  setAdv: (v: StreamAdvancedState) => void;
  parentOptions?: { id: string; name: string }[];
  showShifted?: boolean;
  showDns?: boolean;
  showBitrates?: boolean;
}) {
  function setBitrate(index: number, patch: Partial<BitrateVariant>) {
    const next = [...adv.bitrates];
    next[index] = { ...next[index], ...patch };
    setAdv({ ...adv, bitrates: next });
  }

  function removeBitrate(index: number) {
    const next = adv.bitrates.filter((_, i) => i !== index);
    if (next.length && !next.some((b) => b.isPrimary)) {
      next[0] = { ...next[0], isPrimary: true };
    }
    setAdv({ ...adv, bitrates: next });
  }

  return (
    <div className="space-y-4">
      {showShifted && (
        <div className="rounded border p-4 space-y-3" style={sectionStyle()}>
          <p className="text-sm font-medium">Time-shift / delayed live</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Create a +1h / +2h variant by linking to a parent channel and setting an offset in seconds (3600 = 1 hour).
          </p>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={adv.isShifted}
              onChange={(e) => setAdv({ ...adv, isShifted: e.target.checked })}
            />
            Mark as shifted channel
          </label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span style={{ color: "var(--muted)" }}>Offset (seconds)</span>
              <input
                type="number"
                min={0}
                placeholder="3600 = +1h"
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
                style={{ borderColor: "var(--border)" }}
                value={adv.timeshiftSeconds}
                onChange={(e) => setAdv({ ...adv, timeshiftSeconds: e.target.value })}
              />
            </label>
            {parentOptions && (
              <label className="block text-sm">
                <span style={{ color: "var(--muted)" }}>Parent stream</span>
                <select
                  className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
                  style={{ borderColor: "var(--border)" }}
                  value={adv.parentStreamId}
                  onChange={(e) => setAdv({ ...adv, parentStreamId: e.target.value })}
                >
                  <option value="">None</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      )}

      {showDns && (
        <div className="rounded border p-4 space-y-3" style={sectionStyle()}>
          <p className="text-sm font-medium">DNS rotator</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Rotate upstream hostnames when resolving the play URL. One hostname or IP per line.
          </p>
          <select
            className="w-full rounded border px-3 py-2 bg-transparent text-sm"
            style={{ borderColor: "var(--border)" }}
            value={adv.dnsRotatorMode}
            onChange={(e) =>
              setAdv({ ...adv, dnsRotatorMode: e.target.value as "round_robin" | "random" })
            }
          >
            <option value="round_robin">Round robin</option>
            <option value="random">Random (sticky per line+stream)</option>
          </select>
          <textarea
            rows={3}
            placeholder="cdn1.example.com&#10;cdn2.example.com"
            className="w-full rounded border px-3 py-2 bg-transparent text-sm font-mono"
            style={{ borderColor: "var(--border)" }}
            value={adv.dnsRotatorHosts}
            onChange={(e) => setAdv({ ...adv, dnsRotatorHosts: e.target.value })}
          />
        </div>
      )}

      {showBitrates && (
        <div className="rounded border p-4 space-y-3" style={sectionStyle()}>
          <p className="text-sm font-medium">Multi-bitrate (ABR)</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Optional quality variants. Mark one as primary for probe playback and export.
          </p>
          {adv.bitrates.map((b, i) => (
            <div key={b.id || i} className="grid sm:grid-cols-[1fr_2fr_auto_auto] gap-2 items-end">
              <input
                placeholder="Label (1080p)"
                className="rounded border px-2 py-1.5 bg-transparent text-sm"
                style={{ borderColor: "var(--border)" }}
                value={b.label}
                onChange={(e) => setBitrate(i, { label: e.target.value })}
              />
              <input
                placeholder="Path or URL"
                className="rounded border px-2 py-1.5 bg-transparent text-sm font-mono"
                style={{ borderColor: "var(--border)" }}
                value={b.path}
                onChange={(e) => setBitrate(i, { path: e.target.value })}
              />
              <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                <input
                  type="radio"
                  name="primary-bitrate"
                  checked={Boolean(b.isPrimary)}
                  onChange={() => {
                    setAdv({
                      ...adv,
                      bitrates: adv.bitrates.map((v, j) => ({ ...v, isPrimary: j === i })),
                    });
                  }}
                />
                Primary
              </label>
              <button
                type="button"
                className="text-xs px-2 py-1.5 rounded border cursor-pointer"
                style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                onClick={() => removeBitrate(i)}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-xs px-2 py-1 rounded border cursor-pointer"
            style={{ borderColor: "var(--border)" }}
            onClick={() =>
              setAdv({
                ...adv,
                bitrates: [
                  ...adv.bitrates,
                  {
                    id: `br-${Date.now()}`,
                    label: "",
                    path: "",
                    isPrimary: adv.bitrates.length === 0,
                  },
                ],
              })
            }
          >
            + Add variant
          </button>
        </div>
      )}
    </div>
  );
}

export function StreamFeatureBadges({
  stream,
}: {
  stream: {
    isShifted?: boolean;
    timeshiftSeconds?: number | null;
    dnsRotator?: unknown;
    bitrates?: unknown;
    parentStream?: { name: string } | null;
  };
}) {
  const badges: string[] = [];
  if (stream.isShifted || (stream.timeshiftSeconds != null && stream.timeshiftSeconds > 0)) {
    const h = stream.timeshiftSeconds ? Math.round(stream.timeshiftSeconds / 3600) : 0;
    badges.push(h > 0 ? `+${h}h` : "Shifted");
  }
  if (stream.parentStream) badges.push(`← ${stream.parentStream.name}`);
  const rotator = stream.dnsRotator as { hosts?: string[] } | null;
  if (rotator?.hosts?.length) badges.push(`DNS×${rotator.hosts.length}`);
  const br = Array.isArray(stream.bitrates) ? stream.bitrates.length : 0;
  if (br > 0) badges.push(`ABR×${br}`);
  if (!badges.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <span
          key={b}
          className="text-[10px] px-1.5 py-0.5 rounded"
          style={{ background: "rgba(94,184,232,0.15)", color: "var(--accent)" }}
        >
          {b}
        </span>
      ))}
    </span>
  );
}
