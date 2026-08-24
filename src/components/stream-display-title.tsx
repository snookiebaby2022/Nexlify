import Link from "next/link";
import {
  integrationSourceLabel,
  stripIntegrationSourceSuffix,
} from "@/lib/integration-stream-url";

const badgeClass =
  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

export function streamDisplayName(name: string, streamUrl?: string | null): string {
  const source = integrationSourceLabel(streamUrl ?? "");
  return source ? stripIntegrationSourceSuffix(name) : name;
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
  const source = integrationSourceLabel(streamUrl ?? "");
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

export function IntegrationSourceBadge({ streamUrl }: { streamUrl?: string | null }) {
  const source = integrationSourceLabel(streamUrl ?? "");
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
