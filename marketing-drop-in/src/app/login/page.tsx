import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getSessionUser } from "@/lib/auth";
import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/login");

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; trial?: string }>;
}) {
  const user = await getSessionUser();
  const params = await searchParams;
  if (user) {
    if (user.role === "ADMIN") {
      redirect(params.next?.startsWith("/") ? params.next : "/admin");
    }
    if (params.trial === "1") redirect("/pricing?trial=1");
    redirect(params.next?.startsWith("/") ? params.next : "/dashboard");
  }

  return (
    <div className="mesh-bg flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md glass rounded-3xl p-8">
        <h1 className="font-display text-center text-2xl font-bold text-white">Sign in</h1>
        <p className="mt-2 text-center text-sm text-[var(--muted)]">Access your panel licenses</p>
        {params.next?.startsWith("/admin") ? (
          <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            <strong>IPTV panel operators:</strong> use{" "}
            <a href="https://panel.nexlify.live/login" className="underline text-amber-200">
              panel.nexlify.live/login
            </a>{" "}
            (username + password). This page is for Nexlify license / billing accounts (email sign-in).
          </p>
        ) : null}
        <div className="mt-8">
          <Suspense>
            <AuthForm mode="login" />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
