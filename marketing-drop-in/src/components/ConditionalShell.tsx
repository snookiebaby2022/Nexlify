"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Footer } from "@/components/Footer";
import { LpHeader } from "@/components/LpHeader";
import { Navbar } from "@/components/Navbar";
import type { SessionUser } from "@/lib/auth";

const CouponLaunchBanner = dynamic(
  () => import("@/components/CouponLaunchBanner").then((m) => ({ default: m.CouponLaunchBanner })),
  { ssr: false },
);

type ConditionalShellProps = {
  user: SessionUser | null;
  children: ReactNode;
};

function isLivestreamPath(pathname: string): boolean {
  return pathname === "/livestream" || pathname.startsWith("/livestream/");
}

function isPromoExportPath(pathname: string): boolean {
  return pathname === "/promo/tiktok" || pathname.startsWith("/promo/tiktok-") || pathname === "/promo/meta-ad";
}

export function ConditionalShell({ user, children }: ConditionalShellProps) {
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
        <CouponLaunchBanner isLoggedIn={!!user} />
        <LpHeader />
        <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
      </>
    );
  }

  return (
    <>
      <CouponLaunchBanner isLoggedIn={!!user} />
      <Navbar user={user} />
      <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
      <Footer />
    </>
  );
}
