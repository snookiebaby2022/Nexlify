import { randomInt } from "crypto";

/** Minimum length for line usernames and passwords (panel-wide). */
export const MIN_LINE_CREDENTIAL_LENGTH = 6;

const USER_CHARS = "abcdefghijkmnopqrstuvwxyz";
const PASS_CHARS = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

/** Strip everything except A–Z / a–z (line passwords are letters only). */
export function lettersOnly(value: string): string {
  return String(value ?? "").replace(/[^A-Za-z]/g, "");
}

function randomFrom(chars: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[randomInt(chars.length)];
  }
  return out;
}

/** Random line username (min 6 chars). */
export function generateLineUsername(): string {
  const len = 8 + randomInt(4);
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

const COMMON_LINE_PASSWORDS = new Set(
  [
    "password",
    "password1",
    "123456",
    "12345678",
    "123456789",
    "qwerty",
    "abc123",
    "111111",
    "123123",
    "admin",
    "letmein",
    "welcome",
    "iloveyou",
    "monkey",
    "dragon",
  ].map((s) => s.toLowerCase())
);

export type LinePasswordPolicy = {
  minLength?: number;
  requireLetterAndDigit?: boolean;
  blockCommonPasswords?: boolean;
  disallowUsernameMatch?: boolean;
};

/** Extra line-password rules (1-stream-style restrictions). */
export function validateLinePasswordPolicy(
  password: string,
  username: string,
  policy: LinePasswordPolicy = {}
): string | null {
  const pass = password.trim();
  const user = username.trim();
  const minLength = Math.max(
    MIN_LINE_CREDENTIAL_LENGTH,
    Number(policy.minLength) || MIN_LINE_CREDENTIAL_LENGTH
  );
  const base = validateLineCredential(pass, "password", minLength);
  if (base) return base;
  if (policy.disallowUsernameMatch !== false && user && pass.toLowerCase() === user.toLowerCase()) {
    return "Password cannot match the username";
  }
  if (policy.blockCommonPasswords !== false && COMMON_LINE_PASSWORDS.has(pass.toLowerCase())) {
    return "Password is too common — choose a stronger one";
  }
  if (/[^A-Za-z]/.test(pass)) {
    return "Password may only contain letters";
  }
  return null;
}
