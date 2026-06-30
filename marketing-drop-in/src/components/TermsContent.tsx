import { CONTENT_DISCLAIMER, SOFTWARE_POSITIONING } from "@/lib/marketing-constants";

export function TermsContent() {
  return (
    <div className="prose prose-invert max-w-none space-y-8 text-sm leading-relaxed text-slate-300">
      <section>
        <h2 className="font-display text-xl font-semibold text-white">Software only</h2>
        <p className="mt-3">
          Nexlify sells {SOFTWARE_POSITIONING.toLowerCase()}. We provide panel software licenses,
          billing integration, documentation, and support — not television channels, sports feeds, or
          other media content.
        </p>
        <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-amber-100/90">
          {CONTENT_DISCLAIMER}
        </p>
        <p className="mt-3">
          You deploy and operate the panel on your own infrastructure. You are solely responsible for
          the content, streams, and services you configure through the software and for complying with
          applicable laws and third-party rights.
        </p>
      </section>
    </div>
  );
}
