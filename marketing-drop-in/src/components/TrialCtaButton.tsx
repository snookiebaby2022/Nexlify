"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type TrialCtaButtonProps = {
  className?: string;
  track?: string;
  trackLabel?: string;
  /** When omitted, checks /api/auth/me on the client. */
  loggedIn?: boolean;
  /** sm = compact inline; lg = hero/pricing above-the-fold */
  size?: "sm" | "lg";
};

const sizeClass = {
  lg: "inline-flex min-h-[52px] w-full items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-10 py-4 text-base font-bold text-slate-950 shadow-xl shadow-amber-500/30 hover:brightness-110 transition-all sm:w-auto sm:text-lg",
  sm: "inline-flex min-h-[44px] items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/25 hover:brightness-110 transition-all",
};

export function TrialCtaButton({
  className = "",
  track = "trial_start",
  trackLabel = "trial_cta",
  loggedIn: loggedInProp,
  size = "lg",
}: TrialCtaButtonProps) {
  const [loggedIn, setLoggedIn] = useState(Boolean(loggedInProp));

  useEffect(() => {
    if (loggedInProp !== undefined) {
      setLoggedIn(loggedInProp);
      return;
    }
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setLoggedIn(Boolean(data.user)))
      .catch(() => setLoggedIn(false));
  }, [loggedInProp]);

  const href = loggedIn ? "/pricing?trial=1" : "/register?trial=1";
  const label = loggedIn
    ? "Start 7-Day Free Trial"
    : "Start 7-Day Free Trial – No Card Required";

  return (
    <Link
      href={href}
      data-track={track}
      data-track-label={trackLabel}
      className={`${sizeClass[size]} ${className}`}
    >
      {label}
    </Link>
  );
}
