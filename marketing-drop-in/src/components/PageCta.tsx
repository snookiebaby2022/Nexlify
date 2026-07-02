import Link from "next/link";

type CtaLink = {
  label: string;
  href: string;
  external?: boolean;
  track?: string;
};

type PageCtaProps = {
  primary: CtaLink;
  secondary?: CtaLink[];
  className?: string;
};

const btnBase =
  "inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition-all sm:w-auto";

export function PageCta({ primary, secondary = [], className = "" }: PageCtaProps) {
  const primaryClass = `${btnBase} bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/25 hover:brightness-110`;
  const secondaryClass = `${btnBase} border border-white/20 text-white hover:border-violet-400/40 hover:bg-white/5`;

  return (
    <div
      className={`mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center ${className}`}
    >
      {primary.external ? (
        <a
          href={primary.href}
          target="_blank"
          rel="noopener noreferrer"
          data-track={primary.track}
          className={primaryClass}
        >
          {primary.label}
        </a>
      ) : (
        <Link href={primary.href} data-track={primary.track} className={primaryClass}>
          {primary.label}
        </Link>
      )}

      {secondary.map((link) =>
        link.external ? (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            data-track={link.track}
            className={secondaryClass}
          >
            {link.label}
          </a>
        ) : (
          <Link key={link.href} href={link.href} data-track={link.track} className={secondaryClass}>
            {link.label}
          </Link>
        ),
      )}
    </div>
  );
}
