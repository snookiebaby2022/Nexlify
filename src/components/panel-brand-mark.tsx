"use client";

import Link from "next/link";
import { Login3dLogo } from "@/components/login-3d-logo";

/** Compact Nexlify mark for sidebar / header. */
export function PanelBrandMark({
  name,
  href,
  size = "md",
  showCube = true,
  logoUrl,
}: {
  name: string;
  href: string;
  size?: "sm" | "md";
  showCube?: boolean;
  logoUrl?: string;
}) {
  const cubeDim = size === "sm" ? 32 : 40;
  const textClass = size === "sm" ? "text-base" : "text-lg";

  const inner = logoUrl ? (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl} alt="" className="h-8 w-auto max-w-[120px] object-contain shrink-0" />
      <span className={`panel-brand-text font-bold tracking-tight ${textClass} sr-only`}>{name}</span>
    </>
  ) : (
    <>
      {showCube && (
        <span className="panel-brand-cube shrink-0" style={{ width: cubeDim, height: cubeDim }}>
          <Login3dLogo size="sm" />
        </span>
      )}
      <span className={`panel-brand-text font-bold tracking-tight ${textClass}`}>
        <span className="panel-brand-accent">{name.charAt(0)}</span>
        {name.slice(1)}
      </span>
    </>
  );

  return (
    <Link href={href} className="panel-brand-mark flex items-center gap-2.5 min-w-0 hover:opacity-95 transition-opacity">
      {inner}
    </Link>
  );
}
