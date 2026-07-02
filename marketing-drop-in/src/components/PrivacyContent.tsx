import { site } from "@/lib/site";

export function PrivacyContent() {
  return (
    <div className="prose prose-invert max-w-none space-y-8 text-sm leading-relaxed text-slate-300">
      <section>
        <h2 className="font-display text-lg font-semibold text-white">Who we are</h2>
        <p>
          {site.name} ({site.domain}) provides IPTV panel software licenses, billing integration, and
          support for operators worldwide. Contact:{" "}
          <a href={`mailto:${site.supportEmail}`} className="text-violet-400">
            {site.supportEmail}
          </a>
          .
        </p>
      </section>
      <section>
        <h2 className="font-display text-lg font-semibold text-white">Data we collect</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Account details (email, name) when you register or purchase a license</li>
          <li>Billing records processed via WHMCS or Stripe</li>
          <li>Support tickets and correspondence</li>
          <li>Analytics data (Google Analytics, Umami, GTM) when you accept cookies</li>
          <li>Advertising pixels (Meta, TikTok, LinkedIn) if configured and you accept cookies</li>
        </ul>
      </section>
      <section>
        <h2 className="font-display text-lg font-semibold text-white">Cookies</h2>
        <p>
          We use essential session cookies for login, and optional analytics/advertising cookies after
          you accept our cookie banner. UK visitors may withdraw consent by clearing site data or
          contacting us.
        </p>
      </section>
      <section>
        <h2 className="font-display text-lg font-semibold text-white">Your rights (UK / EU / USA)</h2>
        <p>
          You may request access, correction, or deletion of personal data we hold. We do not sell
          personal information. License and billing records may be retained for legal and accounting
          requirements.
        </p>
      </section>
      <section>
        <h2 className="font-display text-lg font-semibold text-white">Third parties</h2>
        <p>
          Payment processors, email providers, Cloudflare, and analytics vendors may process data on
          our behalf under their own privacy policies.
        </p>
      </section>
      <p className="text-xs text-[var(--muted)]">Last updated June 2026</p>
    </div>
  );
}
