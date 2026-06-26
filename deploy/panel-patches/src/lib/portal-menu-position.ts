export type PortalMenuPosition = {
  top: number;
  left: number;
  flipped: boolean;
};

/** Position a fixed portal menu below the anchor, flipping above when needed. */
export function computePortalMenuPosition(
  anchor: DOMRect,
  menuSize: { width: number; height: number },
  opts?: { gap?: number; pad?: number }
): PortalMenuPosition {
  const gap = opts?.gap ?? 6;
  const pad = opts?.pad ?? 8;
  const menuW = menuSize.width;
  const menuH = menuSize.height;

  let top = anchor.bottom + gap;
  let flipped = false;

  if (top + menuH > window.innerHeight - pad) {
    const above = anchor.top - menuH - gap;
    if (above >= pad) {
      top = above;
      flipped = true;
    } else {
      top = Math.max(pad, window.innerHeight - menuH - pad);
    }
  }

  let left = anchor.right - menuW;
  left = Math.max(pad, Math.min(left, window.innerWidth - menuW - pad));

  return { top, left, flipped };
}
