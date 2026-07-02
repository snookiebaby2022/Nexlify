/** Minimum length for line usernames and passwords (panel-wide). */
export const MIN_LINE_CREDENTIAL_LENGTH = 6;

const USER_CHARS = "abcdefghijkmnopqrstuvwxyz0123456789";
const PASS_CHARS = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";

function randomFrom(chars: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/** Random line username (min 6 chars). */
export function generateLineUsername(): string {
  const len = 8 + Math.floor(Math.random() * 4);
  return randomFrom(USER_CHARS, Math.max(MIN_LINE_CREDENTIAL_LENGTH, len));
}

/** Random line password (min 6 chars). */
export function generateLinePassword(length = 12): string {
  return randomFrom(PASS_CHARS, Math.max(MIN_LINE_CREDENTIAL_LENGTH, length));
}

export function validateLineCredential(
  value: string,
  field: "username" | "password",
  minLength = MIN_LINE_CREDENTIAL_LENGTH
): string | null {
  const v = value.trim();
  if (!v) return `${field === "username" ? "Username" : "Password"} is required`;
  if (v.length < minLength) {
    return `${field === "username" ? "Username" : "Password"} must be at least ${minLength} characters`;
  }
  return null;
}
