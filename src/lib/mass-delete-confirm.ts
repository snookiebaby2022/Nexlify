/** Shared confirm gate for admin mass-delete (must match entity + count). */
export function assertMassDeleteConfirm(input: {
  entity: string;
  ids: string[];
  confirmEntity: unknown;
  confirmCount: unknown;
}): { ok: true } | { ok: false; error: string } {
  if (String(input.confirmEntity ?? "") !== input.entity || Number(input.confirmCount) !== input.ids.length) {
    return { ok: false, error: "Confirm entity and count required" };
  }
  return { ok: true };
}
