import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { site } from "@/lib/site";

import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/refund-policy");

export default function RefundPolicyPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Refund policy", path: "/refund-policy" },
        ]}
      />
      <WebPageJsonLd path="/refund-policy" name="Refund policy" description="Refund policy for Nexlify IPTV panel license purchases. All sales final — billing disputes handled via support tickets." about="Refund policy" />

    <div className="mesh-bg min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-16 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
          {site.domain}
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold text-white md:text-4xl">
          Refund policy
        </h1>
        <p className="mt-4 text-sm text-[var(--muted)]">Last updated June 2026</p>

        <div className="mt-10 space-y-8">
          <section className="glass rounded-2xl p-6 md:p-8">
            <h2 className="font-display text-xl font-semibold text-white">All sales are final</h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              Please carefully review your order before confirming your purchase. All sales are
              considered final. We do not offer refunds or exchanges for any products or services
              sold through Nexlify.
            </p>
          </section>

          <section className="glass rounded-2xl p-6 md:p-8">
            <h2 className="font-display text-xl font-semibold text-white">Please contact us</h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              If you have any questions, concerns, or complaints regarding this refund policy, we
              encourage you to contact us using a support ticket on our website.
            </p>
            <Link
              href="/support"
              className="mt-6 inline-flex rounded-full border border-violet-500/40 px-5 py-2 text-sm font-semibold text-violet-200 transition-colors hover:bg-violet-500/10"
            >
              Create a support ticket
            </Link>
          </section>
        </div>
      </div>
    </div>
    </>
  );
}
