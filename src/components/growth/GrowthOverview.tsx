import Link from "next/link";
import { CopyLinkButton } from "@/components/growth/CopyLinkButton";
import { GrowthShell } from "@/components/growth/GrowthShell";
import {
  CAMPAIGNS,
  DEMO_URL,
  LICENSE_PRICING_URL,
  SITE_URL,
  campaignLink,
} from "@/lib/growth-urls";

export function GrowthOverview() {
  const featured = campaignLink("tiktok-bio");

  return (
    <GrowthShell current="/grow" title="Growth toolkit overview">
      <header className="growth-hero">
        <p className="growth-eyebrow">Marketing toolkit</p>
        <h1>Get more visitors and license sales</h1>
        <p className="growth-lead">
          Copy tracked links for TikTok, Discord, and ads. Every click carries UTM tags so you
          can see what converts in analytics.
        </p>
      </header>

      <section aria-labelledby="start-heading" className="growth-section">
        <h2 id="start-heading">Start here</h2>
        <div className="growth-card-grid">
          <a href={featured} className="growth-card growth-card-link">
            <p className="growth-card-label">Recommended bio link</p>
            <p className="growth-card-title">TikTok promo page</p>
            <p className="growth-card-desc">Video + download + license CTA — use in your bio.</p>
          </a>
          <Link href="/grow/links" className="growth-card growth-card-link">
            <p className="growth-card-label">Link kit</p>
            <p className="growth-card-title">All campaign URLs</p>
            <p className="growth-card-desc">Copy links for every channel with one click.</p>
          </Link>
        </div>
      </section>

      <section aria-labelledby="dest-heading" className="growth-section">
        <h2 id="dest-heading">Direct destinations</h2>
        <ul className="growth-pill-row">
          <li>
            <a href={LICENSE_PRICING_URL} className="growth-pill growth-pill-orange">
              Pricing page
            </a>
          </li>
          <li>
            <a href={`${DEMO_URL}/login`} className="growth-pill growth-pill-cyan">
              Live panel demo
            </a>
          </li>
        </ul>
      </section>

      <section aria-labelledby="quick-heading" className="growth-section">
        <h2 id="quick-heading">Quick copy</h2>
        <ul className="growth-list">
          {CAMPAIGNS.slice(0, 3).map((c) => {
            const href = c.href({});
            return (
              <li key={c.id} className="growth-list-item">
                <div>
                  <p className="growth-list-title">{c.label}</p>
                  <p className="growth-list-url" title={href}>
                    {href}
                  </p>
                </div>
                <div className="growth-list-actions">
                  <CopyLinkButton href={href} label={c.label} />
                  <a href={href} className="growth-btn-ghost text-xs">
                    Open
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="growth-muted">
          <Link href="/grow/links">View all campaign links →</Link>
        </p>
      </section>

      <section aria-labelledby="tips-heading" className="growth-section growth-tips">
        <h2 id="tips-heading">What to post</h2>
        <ol className="growth-tips-list">
          <li>
            <strong>TikTok bio</strong> — use the TikTok promo link above.
          </li>
          <li>
            <strong>Video CTA</strong> — pin a comment: “Try the demo → {SITE_URL.replace("https://", "")}”
          </li>
          <li>
            <strong>Discord / groups</strong> — use the text landing or short demo link.
          </li>
        </ol>
      </section>
    </GrowthShell>
  );
}
