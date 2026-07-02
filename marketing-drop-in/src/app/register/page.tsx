import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { SoftwareProductJsonLd } from "@/components/SoftwareProductJsonLd";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { AuthForm } from "@/components/AuthForm";
import { getSessionUser } from "@/lib/auth";
import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/register");

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ trial?: string }>;
}) {
  const user = await getSessionUser();
  if (user) {
    const params = await searchParams;
    redirect(params.trial === "1" ? "/pricing?trial=1" : "/dashboard");
  }
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Register", path: "/register" },
        ]}
      />
      <WebPageJsonLd
        path="/register"
        name="Create your Nexlify account"
        description="Register for a Nexlify IPTV reseller account and start a 7-day free trial for worldwide operators."
        about="Register"
      />
      <SoftwareProductJsonLd
        path="/register"
        name="Nexlify IPTV Panel — 7-Day Trial"
        description="IPTV reseller panel with WHMCS IPTV module and IPTV management software. Start a 7-day free trial."
        includeProduct
      />
      <div className="mesh-bg flex min-h-[70vh] items-center justify-center px-4 py-16">
        <div className="w-full max-w-md glass rounded-3xl p-8">
          <h1 className="font-display text-center text-2xl font-bold text-white">
            Create your best reseller panel account
          </h1>
          <p className="mt-2 text-center text-sm text-[var(--muted)]">
            Start a free 7-day trial for worldwide operators, or purchase licenses through WHMCS
            checkout with GBP or USD billing
          </p>
          <div className="mt-8">
            <Suspense>
              <AuthForm mode="register" />
            </Suspense>
          </div>
        </div>
      </div>
    </>
  );
}
