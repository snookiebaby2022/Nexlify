import { CONTENT_DISCLAIMER } from "@/lib/marketing-constants";

type ContentDisclaimerProps = {
  variant?: "inline" | "block";
  className?: string;
};

export function ContentDisclaimer({ variant = "inline", className = "" }: ContentDisclaimerProps) {
  if (variant === "block") {
    return (
      <aside
        className={`rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm leading-relaxed text-amber-100/90 ${className}`}
        role="note"
      >
        {CONTENT_DISCLAIMER}
      </aside>
    );
  }

  return (
    <p className={`text-xs leading-relaxed text-[var(--muted)] ${className}`} role="note">
      {CONTENT_DISCLAIMER}
    </p>
  );
}
