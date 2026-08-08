export type LicenseDeletableInput = {
  status: string;
  expiresAt: Date | null;
};

/** Licenses safe to permanently remove from the database. */
export function isLicenseDeletable(lic: LicenseDeletableInput): boolean {
  if (lic.status === "UNUSED") return true;
  if (lic.status === "REVOKED" || lic.status === "EXPIRED") return true;
  if (lic.expiresAt && lic.expiresAt.getTime() < Date.now()) return true;
  return false;
}
