import Link from "next/link";
import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/order/success");

export default function OrderSuccessPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-10">
        <h1 className="font-display text-2xl font-bold text-white">Thank you for your order</h1>
        <p className="mt-4 text-slate-400">
          Your payment was received. License keys and setup details will be emailed shortly and
          are also available in your dashboard.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="inline-block rounded-lg bg-cyan-500 px-6 py-2.5 font-semibold text-slate-950"
          >
            My licenses
          </Link>
        </div>
        <p className="mt-6 text-sm text-slate-500">
          Need help?{" "}
          <Link href="/support" className="text-cyan-400 hover:underline">
            Open a support ticket
          </Link>
        </p>
      </div>
    </div>
  );
}
