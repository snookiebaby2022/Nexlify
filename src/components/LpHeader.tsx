import Link from "next/link";
import { site } from "@/lib/site";

export function LpHeader() {
  return (
    <header className="border-b border-white/10 bg-[#080612]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <Link href="/" className="font-display text-lg font-semibold text-white">
          {site.name}
        </Link>
        <Link
          href="/pricing"
          data-track="checkout_start"
          data-track-label="lp_header_pricing"
          className="min-h-[44px] rounded-full bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
        >
          View pricing
        </Link>
      </div>
    </header>
  );
}
