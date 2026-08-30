import Link from "next/link";
import {
  integrationSourceLabel,
  stripIntegrationSourceSuffix,
} from "@/lib/integration-stream-url";
import { displayCatalogStreamName } from "@/lib/stream-catalog-name";

const badgeClass =
  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

function integrationSourceFromName(name: string): string | null {
  const m = String(name ?? "").match(/\((Plex|Emby|Jellyfin|YouTube|Spotify|Deezer|Apple Music)\)\s*$/i);
  if (!m) return null;
  const key = m[1].toLowerCase().replace(/\s+/g, " ");
  if (key === "apple music") return "Apple Music";
  return m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
}

export function integrationSourceForStream(
  name: string,
  streamUrl?: string | null
): string | null {
  return integrationSourceLabel(streamUrl ?? "") ?? integrationSourceFromName(name);
}

export function streamDisplayName(name: string, _streamUrl?: string | null): string {
  return displayCatalogStreamName(stripIntegrationSourceSuffix(name));
}

export function StreamDisplayTitle({
  name,
  streamUrl,
  href,
  className,
}: {
  name: string;
  streamUrl?: string | null;
  href?: string;
  className?: string;
}) {
  const source = integrationSourceForStream(name, streamUrl);
  const displayName = streamDisplayName(name, streamUrl);
  const label = href ? (
    <Link href={href} className={className}>
      {displayName}
    </Link>
  ) : (
    <span className={className}>{displayName}</span>
  );

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 min-w-0">
      {label}
      {source ? (
        <span
          className={badgeClass}
          style={{ background: "var(--border)", color: "var(--muted)" }}
          title="Imported from integration"
        >
          {source}
        </span>
      ) : null}
    </span>
  );
}

export function IntegrationSourceBadge({
  streamUrl,
  name,
}: {
  streamUrl?: string | null;
  name?: string;
}) {
  const source = integrationSourceForStream(name ?? "", streamUrl);
  if (!source) return null;
  return (
    <span
      className={badgeClass}
      style={{ background: "var(--border)", color: "var(--muted)" }}
      title="Imported from integration"
    >
      {source}
    </span>
  );
}
