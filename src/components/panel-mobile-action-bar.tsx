"use client";

import Link from "next/link";

export function PanelMobileActionBar({
  cancelHref,
  cancelLabel = "Cancel",
  onCancel,
  onSave,
  saveLabel = "Save Changes",
  saveDisabled = false,
  saveBusy = false,
}: {
  cancelHref?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  onSave?: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  saveBusy?: boolean;
}) {
  return (
    <div className="panel-mobile-action-bar md:hidden">
      {cancelHref ? (
        <Link href={cancelHref} className="panel-mobile-action-bar-btn panel-mobile-action-bar-btn--ghost">
          {cancelLabel}
        </Link>
      ) : (
        <button
          type="button"
          className="panel-mobile-action-bar-btn panel-mobile-action-bar-btn--ghost"
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
      )}
      <button
        type="button"
        className="panel-mobile-action-bar-btn panel-mobile-action-bar-btn--primary"
        onClick={onSave}
        disabled={saveDisabled || saveBusy}
      >
        {saveBusy ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}
