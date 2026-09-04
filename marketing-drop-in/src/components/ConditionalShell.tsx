"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Footer } from "@/components/Footer";
import { FreeLaunchBanner } from "@/components/FreeLaunchBanner";
import { LpHeader } from "@/components/LpHeader";
import { Navbar } from "@/components/Navbar";
import type { SessionUser } from "@/lib/auth";

type ConditionalShellProps = {
  user: SessionUser | null;
  impersonator?: SessionUser | null;
  children: ReactNode;
};

function isLivestreamPath(pathname: string): boolean {
  return pathname === "/livestream" || pathname.startsWith("/livestream/");
}

function isPromoExportPath(pathname: string): boolean {
  return pathname === "/promo/tiktok" || pathname.startsWith("/promo/tiktok-") || pathname === "/promo/meta-ad";
}

export function ConditionalShell({ user, impersonator, children }: ConditionalShellProps) {
  const pathname = usePathname() ?? "";

  if (isLivestreamPath(pathname)) {
    return <main className="h-dvh w-screen overflow-hidden bg-black p-0">{children}</main>;
  }

  if (isPromoExportPath(pathname)) {
    return <main className="min-h-dvh w-screen overflow-hidden bg-black p-0">{children}</main>;
  }

  const isLp = pathname.startsWith("/lp/");

  if (isLp) {
    return (
      <>
        <FreeLaunchBanner />
        <LpHeader />
        <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
      </>
    );
  }

  return (
    <>
      {impersonator ? (
        <div className="bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-slate-950">
          Viewing as {user?.email}.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              void fetch("/api/admin/users/stop-impersonate", { method: "POST" }).then((r) =>
                r.json().then((d) => {
                  window.location.href = d.redirect ?? "/admin?tab=users";
                })
              );
            }}
          >
            Return to admin
          </button>
        </div>
      ) : null}
      <FreeLaunchBanner />
      <Navbar user={user} />
      <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
      <Footer />
    </>
  );
}
