import Link from "next/link";
import {
  PanelDashboardSlide,
  PanelResellerSlide,
  PanelWhmcsBillingSlide,
} from "@/components/demo/panel-slide-views";
import { DEMO_PANEL_URL } from "@/lib/demo";

const SCREENSHOTS = [
  {
    View: PanelDashboardSlide,
    title: "Operator dashboard",
    caption: "Live metrics, expiring lines, and stream health at a glance.",
    alt: "Nexlify IPTV panel dashboard showing active lines, streams, and server health metrics",
  },
  {
    View: PanelWhmcsBillingSlide,
    title: "WHMCS billing sync",
    caption: "Orders, renewals, and suspensions stay in sync with your cart.",
    alt: "Nexlify WHMCS billing integration with automatic license provisioning on order",
  },
  {
    View: PanelResellerSlide,
    title: "Reseller hierarchy",
    caption: "Sub-resellers, credits, and commission reports in one view.",
    alt: "Nexlify reseller hierarchy panel for sub-reseller management and commission tracking",
  },
] as const;

const LOOM_URL = process.env.NEXT_PUBLIC_LOOM_DEMO_URL?.trim() || null;

export function DemoScreenshots() {
  return (
    <section className="border-y border-white/10 bg-[#080612] py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400/90">
          See the panel
        </p>
        <h2 className="font-display mt-3 text-2xl font-bold text-white sm:text-3xl md:text-4xl">
          Dashboard, billing, and reseller flows
        </h2>
        <p className="mt-4 max-w-2xl text-[var(--muted)]">
          Same back-office UI your operators get in production — explore the{" "}
          <a
            href={DEMO_PANEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:text-violet-300 underline"
          >
            live demo
          </a>{" "}
          or start a{" "}
          <Link href="/register?trial=1" className="text-violet-400 hover:text-violet-300 underline">
            7-day trial
          </Link>
          .
        </p>

        <div className="mt-12 grid gap-8 lg:grid-cols-3">
          {SCREENSHOTS.map((shot) => {
            const View = shot.View;
            return (
              <figure key={shot.title} className="flex flex-col">
                <div role="img" aria-label={shot.alt} className="overflow-hidden">
                  <View />
                </div>
                <figcaption className="mt-5 px-1">
                  <h3 className="font-semibold text-white">{shot.title}</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">{shot.caption}</p>
                </figcaption>
              </figure>
            );
          })}
        </div>

        {LOOM_URL ? (
          <div className="mt-12 overflow-hidden rounded-2xl border border-white/10">
            <iframe
              src={LOOM_URL}
              title="Nexlify IPTV panel walkthrough"
              allowFullScreen
              className="aspect-video w-full"
            />
          </div>
        ) : (
          <p className="mt-10 text-center text-sm text-[var(--muted)]">
            Prefer hands-on?{" "}
            <Link href="/demo" className="text-violet-400 hover:text-violet-300 underline">
              Open the full demo walkthrough
            </Link>
            .
          </p>
        )}
      </div>
    </section>
  );
}
