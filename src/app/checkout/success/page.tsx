import Link from "next/link";
import { redirect } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";
import { getSessionUser } from "@/lib/auth";
import { issueLicenseForOrder } from "@/lib/licensing";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/checkout/success");

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; order_id?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  let license = null;

  if (params.order_id) {
    const order = await prisma.order.findFirst({
      where: { id: params.order_id, userId: user.id },
      include: { license: true },
    });
    if (order?.status === "COMPLETED" && !order.license) {
      await issueLicenseForOrder(order.id);
    }
    license = await prisma.license.findFirst({
      where: { orderId: params.order_id },
      include: { plan: true },
    });
  }

  if (params.session_id && isStripeConfigured()) {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(params.session_id);
    const orderId = session.metadata?.orderId;

    if (orderId) {
      const order = await prisma.order.findFirst({
        where: { id: orderId, userId: user.id },
      });
      if (order && order.status !== "COMPLETED" && session.payment_status === "paid") {
        await prisma.order.update({
          where: { id: orderId },
          data: { status: "COMPLETED" },
        });
        await issueLicenseForOrder(orderId);
      }
      license = await prisma.license.findFirst({
        where: { orderId },
        include: { plan: true },
      });
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-10">
        <h1 className="text-2xl font-bold text-white">Payment successful</h1>
        {license ? (
          <>
            <p className="mt-4 text-slate-400">Your panel license key:</p>
            <p className="mt-4 font-mono text-lg text-cyan-300">{license.key}</p>
            <div className="mt-4 flex justify-center gap-2">
              <CopyButton text={license.key} />
            </div>
            <p className="mt-4 text-sm text-slate-500">
              Plan: {license.plan.name} · enter this key in your panel setup wizard.
            </p>
          </>
        ) : (
          <p className="mt-4 text-slate-400">
            Your license is being issued. Check{" "}
            <Link href="/dashboard" className="text-cyan-400 hover:underline">
              My Licenses
            </Link>{" "}
            in a moment.
          </p>
        )}
        <Link
          href="/dashboard"
          className="mt-8 inline-block rounded-lg bg-cyan-500 px-6 py-2.5 font-semibold text-slate-950"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
