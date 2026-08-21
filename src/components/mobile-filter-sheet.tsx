"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/** Bottom sheet for filters / bulk actions on small screens. */
export function MobileFilterSheet({
  open,
  onClose,
  title = "Filters & actions",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="panel-mobile-sheet-backdrop md:hidden"
        aria-label="Close panel"
        onClick={onClose}
      />
      <div
        className="panel-mobile-sheet md:hidden"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="panel-mobile-sheet-handle" aria-hidden />
        <div className="panel-mobile-sheet-header">
          <h2 className="panel-mobile-sheet-title">{title}</h2>
          <button
            type="button"
            className="panel-mobile-sheet-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        <div className="panel-mobile-sheet-body">{children}</div>
      </div>
    </>
  );
}
