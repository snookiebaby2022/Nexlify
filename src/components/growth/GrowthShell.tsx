import Link from "next/link";
import { SITE_URL } from "@/lib/growth-urls";

const NAV = [
  { href: "/grow", label: "Overview" },
  { href: "/grow/links", label: "All links" },
  { href: "/promo?utm_source=nexlify&utm_medium=nav&utm_campaign=operators", label: "Preview promo" },
] as const;

type GrowthShellProps = {
  children: React.ReactNode;
  current?: "/grow" | "/grow/links";
  title: string;
};

export function GrowthShell({ children, current, title }: GrowthShellProps) {
  return (
    <div className="growth-page">
      <a href="#growth-main" className="growth-skip">
        Skip to content
      </a>
      <header className="growth-header">
        <div className="growth-container growth-header-inner">
          <Link href="/grow" className="growth-brand">
            <span className="growth-brand-mark" aria-hidden>
              N
            </span>
            <span>
              Nexlify <strong>Growth</strong>
            </span>
          </Link>
          <nav aria-label="Growth toolkit">
            <ul className="growth-nav">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={
                      (current === "/grow" && item.href === "/grow") ||
                      (current === "/grow/links" && item.href === "/grow/links")
                        ? "page"
                        : undefined
                    }
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main id="growth-main" className="growth-container growth-main" aria-label={title}>
        {children}
      </main>
      <footer className="growth-footer">
        <p>
          Public site:{" "}
          <a href={SITE_URL}>{SITE_URL.replace("https://", "")}</a>
        </p>
      </footer>
    </div>
  );
}
