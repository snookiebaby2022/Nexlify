import { timingSafeEqual } from "crypto";

/**
 * Constant-time string compare for secrets. Returns false if either value is empty.
 */
export function secretsEqual(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (provided == null || expected == null) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length === 0 || b.length === 0) return false;
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$/;

/** True only when the admin hash is missing or not bcrypt — never after a valid password is set. */
export function canRepairAdminHash(opts: {
  isAdminTarget: boolean;
  user: { passwordHash: string; isActive: boolean } | null;
}): boolean {
  if (!opts.isAdminTarget) return false;
  if (!opts.user) return true;
  return !BCRYPT_HASH_RE.test(opts.user.passwordHash);
}
