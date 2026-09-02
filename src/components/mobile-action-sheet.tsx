"use client";

import { MobileToolbarSheet } from "@/components/mobile-toolbar-sheet";

export type MobileActionSheetItem = {
  id: string;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

/** Touch-friendly action list for row menus on compact layouts. */
export function MobileActionSheet({
  open,
  onClose,
  title = "Actions",
  items,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  items: MobileActionSheetItem[];
}) {
  return (
    <MobileToolbarSheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="panel-mobile-card-action w-full text-left px-4 py-3 rounded-lg text-sm font-medium"
            style={{
              color: item.destructive ? "var(--danger)" : "var(--text)",
              opacity: item.disabled ? 0.5 : 1,
            }}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </MobileToolbarSheet>
  );
}
