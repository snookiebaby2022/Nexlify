import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";
import { getSessionUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { TRIAL_PLAN_SLUG } from "@/lib/plans";
import { TrialCouponBanner } from "@/components/TrialCouponBanner";
import { TrialCouponRedirect } from "@/components/TrialCouponRedirect";
import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/dashboard");

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const licenses = await prisma.license.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { plan: true, order: true },
  });

  const trialLicense = licenses.find(
    (l) => l.plan.slug === TRIAL_PLAN_SLUG && l.status !== "REVOKED" && l.status !== "EXPIRED",
  );
  const trialExpired =
    trialLicense?.expiresAt && trialLicense.expiresAt < new Date();

  return (
    <div className="mesh-bg mx-auto max-w-6xl px-4 py-16 md:py-24">
      <Suspense fallback={null}>
        <TrialCouponRedirect />
      </Suspense>
            <h1 className="font-display text-3xl font-bold text-white">My licenses</h1>
      <p className="mt-2 text-[var(--muted)]">
        Signed in as {user.email}. Keys from WHMCS or checkout — paste into your panel activation.
      </p>

      {trialLicense && !trialExpired && (
        <>
          <div className="mt-8 glass rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-6">
            <p className="text-sm text-cyan-100">
              <strong className="text-white">Free trial active</strong> — expires{" "}
              {formatDate(trialLicense.expiresAt)}. Upgrade to keep full access after 7 days.
            </p>
            <Link
              href="/pricing"
              className="mt-4 inline-flex rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Upgrade plan →
            </Link>
          </div>
          <TrialCouponBanner expiresLabel={formatDate(trialLicense.expiresAt)} />
        </>
      )}

      {trialLicense && trialExpired && (
        <div className="mt-8 glass rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
          <p className="text-sm text-amber-100">
            Your free trial has ended. Choose a paid plan to continue.
          </p>
          <Link
            href="/pricing"
            className="mt-4 inline-flex rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            View paid plans →
          </Link>
        </div>
      )}

      {licenses.length === 0 ? (
        <div className="mt-12 glass rounded-2xl p-12 text-center">
          <p className="text-slate-400">No licenses yet.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-4">
            <Link
              href="/pricing?trial=1"
              className="text-cyan-400 hover:underline"
            >
              Start free 7-day trial →
            </Link>
            <Link href="/pricing" className="text-violet-400 hover:underline">
              Get a free license →
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-10 overflow-x-auto glass rounded-2xl">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">License key</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium">Servers</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {licenses.map((lic) => (
                <tr key={lic.id} className="border-b border-slate-800/80">
                  <td className="px-4 py-3 font-mono text-cyan-300">
                    <span className="mr-2">{lic.key}</span>
                    <CopyButton text={lic.key} />
                  </td>
                  <td className="px-4 py-3">{lic.plan.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        lic.status === "ACTIVE"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : lic.status === "REVOKED" || lic.status === "SUSPENDED"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-slate-700 text-slate-300"
                      }`}
                    >
                      {lic.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{formatDate(lic.expiresAt)}</td>
                  <td className="px-4 py-3">{lic.plan.maxServers}</td>
                  <td className="px-4 py-3">
                    {lic.plan.slug === TRIAL_PLAN_SLUG && (
                      <Link href="/pricing" className="text-violet-400 hover:underline">
                        Upgrade
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
