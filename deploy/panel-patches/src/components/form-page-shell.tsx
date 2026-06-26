"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function FormPageShell({
  title,
  manageHref,
  manageLabel = "Manage Users",
  children,
}: {
  title: string;
  manageHref: string;
  manageLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-0 max-w-5xl panel-form-mobile-tight">
      <div
        className="flex items-center justify-between px-5 py-3.5 rounded-t-lg"
        style={{
          background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 50%, #2a9fd6 100%)",
        }}
      >
        <h1 className="text-lg font-semibold text-white tracking-wide">{title}</h1>
        <Link
          href={manageHref}
          className="text-sm px-4 py-1.5 rounded border border-white/80 text-white hover:bg-white/10 transition-colors"
        >
          {manageLabel}
        </Link>
      </div>
      <div
        className="rounded-b-lg border border-t-0 p-4 sm:p-5 md:p-6"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        {children}
      </div>
    </div>
  );
}

export function FormField({
  label,
  required,
  children,
  className = "",
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="font-medium">
        {label}
        {required && <span style={{ color: "#ef4444" }}> *</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const formInputClass =
  "w-full rounded border px-3 py-2.5 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[#00c0ef]/50";

export const formInputStyle = { borderColor: "var(--border)" };

export const formSelectClass = "panel-select w-full rounded border px-3 py-2.5 text-sm";
