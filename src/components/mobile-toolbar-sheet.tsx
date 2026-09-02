"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/** Bottom sheet for filters, columns, bulk actions, or row menus on touch layouts. */
export function MobileToolbarSheet({
  open,
  onClose,
  title = "Options",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const focusFirst = () => closeRef.current?.focus();
    const frame = requestAnimationFrame(focusFirst);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [open, onClose]);

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
        ref={sheetRef}
        className="panel-mobile-sheet md:hidden"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="panel-mobile-sheet-handle" aria-hidden />
        <div className="panel-mobile-sheet-header">
          <h2 className="panel-mobile-sheet-title">{title}</h2>
          <button
            ref={closeRef}
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

/** @deprecated Use MobileToolbarSheet */
export const MobileFilterSheet = MobileToolbarSheet;
