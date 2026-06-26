"use client";

import Link from "next/link";
import { Login3dLogo } from "@/components/login-3d-logo";

/** Compact Nexlify mark for sidebar / header. */
export function PanelBrandMark({
  name,
  href,
  size = "md",
  showCube = true,
}: {
  name: string;
  href: string;
  size?: "sm" | "md";
  showCube?: boolean;
}) {
  const cubeDim = size === "sm" ? 32 : 40;
  const textClass = size === "sm" ? "text-base" : "text-lg";

  const inner = (
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
