"use client";

import Link from "next/link";
import { CopyLinkButton } from "@/components/growth/CopyLinkButton";
import { GrowthShell } from "@/components/growth/GrowthShell";
import { CAMPAIGNS } from "@/lib/growth-urls";

export function GrowthLinksPage() {
  return (
    <GrowthShell current="/grow/links" title="Campaign links">
      <header className="growth-hero">
        <h1>Campaign links</h1>
        <p className="growth-lead">
          Paste these in TikTok, Discord, or ads. UTM tags pass through to pricing and demo when
          visitors click through.
        </p>
      </header>

      <ol className="growth-campaign-list">
        {CAMPAIGNS.map((c, i) => {
          const href = c.href({});
          return (
            <li key={c.id}>
              <article className="growth-campaign-card" aria-labelledby={`c-${c.id}`}>
                <p className="growth-campaign-index">
                  Campaign {i + 1} of {CAMPAIGNS.length}
                </p>
                <h2 id={`c-${c.id}`} className="growth-campaign-title">
                  {c.label}
                </h2>
                <p className="growth-campaign-desc">{c.description}</p>
                <label htmlFor={`url-${c.id}`} className="growth-field-label">
                  URL to share
                </label>
                <textarea
                  id={`url-${c.id}`}
                  readOnly
                  rows={2}
                  value={href}
                  className="growth-url-field"
                  aria-describedby={`hint-${c.id}`}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <p id={`hint-${c.id}`} className="growth-field-hint">
                  Focus the field to select all, or use Copy link.
                </p>
                <div className="growth-list-actions">
                  <CopyLinkButton href={href} label={c.label} />
                  <a href={href} className="growth-btn-ghost text-xs">
                    Preview
                  </a>
                </div>
              </article>
            </li>
          );
        })}
      </ol>

      <p className="growth-muted">
        <Link href="/grow">← Back to overview</Link>
      </p>
    </GrowthShell>
  );
}
