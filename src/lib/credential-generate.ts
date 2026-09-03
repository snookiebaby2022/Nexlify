/** Absolute floor — Settings → Security can set this as low as 3. */
export const MIN_LINE_CREDENTIAL_FLOOR = 3;
/** Default when Settings has no value (new installs). */
export const DEFAULT_LINE_CREDENTIAL_MIN_LENGTH = 6;
/**
 * Lowest length the panel will accept. Callers that need the *configured*
 * minimum should pass `clampLineCredentialMinLength(settings.lineCredentialMinLength)`.
 */
export const MIN_LINE_CREDENTIAL_LENGTH = MIN_LINE_CREDENTIAL_FLOOR;
/** Alias used for panel users (resellers / sub-resellers). */
export const MIN_PANEL_CREDENTIAL_LENGTH = DEFAULT_LINE_CREDENTIAL_MIN_LENGTH;

export function clampLineCredentialMinLength(
  value: unknown,
  fallback = DEFAULT_LINE_CREDENTIAL_MIN_LENGTH
): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(64, Math.max(MIN_LINE_CREDENTIAL_FLOOR, n));
}

const USER_CHARS = "abcdefghijkmnopqrstuvwxyz0123456789";
const PASS_CHARS =
  "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

/**
 * Browser-safe random int in [0, max).
 * Avoids Node `crypto` so this module can be imported from client components
 * (Add Line / Edit Line) without causing a client-side Application error.
 */
function randomInt(max: number): number {
  if (max <= 0) return 0;
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
}

/**
 * @deprecated Line credentials now allow letters and numbers.
 * Kept for older imports — prefer not stripping typed passwords.
 */
export function lettersOnly(value: string): string {
  return String(value ?? "").replace(/[^A-Za-z0-9]/g, "");
}

/** Keep letters, numbers, and common safe symbols (no spaces / path breakers). */
export function sanitizeCredentialInput(value: string): string {
  return String(value ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\s+/g, "")
    .slice(0, 256);
}

function randomFrom(chars: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[randomInt(chars.length)];
  }
  return out;
}

/** Random line username (letters + digits). */
export function generateLineUsername(): string {
  const len = 8 + randomInt(4);
  return randomFrom(USER_CHARS, Math.max(DEFAULT_LINE_CREDENTIAL_MIN_LENGTH, len));
}

/** Random line password (letters + digits). */
export function generateLinePassword(length = 12): string {
  return randomFrom(PASS_CHARS, Math.max(DEFAULT_LINE_CREDENTIAL_MIN_LENGTH, length));
}

export function validateLineCredential(
  value: string,
  field: "username" | "password",
  minLength = DEFAULT_LINE_CREDENTIAL_MIN_LENGTH
): string | null {
  const v = sanitizeCredentialInput(value);
  const label = field === "username" ? "Username" : "Password";
  if (!v) return `${label} is required`;
  if (v.length < minLength) {
    return `${label} must be at least ${minLength} characters`;
  }
  if (/\s/.test(String(value ?? ""))) {
    return `${label} cannot contain spaces`;
  }
  // Path-safe for /live/{user}/{pass}/… — allow letters, numbers, and common symbols.
  if (/[\/\\?#%]/.test(v)) {
    return `${label} cannot contain / \\ ? # or %`;
  }
  return null;
}

/** Usernames reserved for the panel bootstrap admin — cannot be used for resellers/sub-resellers. */
export const RESERVED_PANEL_USERNAMES = new Set([
  "admin",
  "administrator",
  "root",
  "nexlify",
  "support",
]);

export function validatePanelAccountCredentials(
  username: string,
  password: string,
  minLength = MIN_PANEL_CREDENTIAL_LENGTH
): string | null {
  const userErr = validateLineCredential(username, "username", minLength);
  if (userErr) return userErr;
  if (RESERVED_PANEL_USERNAMES.has(sanitizeCredentialInput(username).toLowerCase())) {
    return "That username is reserved — choose another";
  }
  const passErr = validateLineCredential(password, "password", minLength);
  if (passErr) return passErr;
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

/** Extra line-password rules (optional letter+digit / common-password checks). */
export function validateLinePasswordPolicy(
  password: string,
  username: string,
  policy: LinePasswordPolicy = {}
): string | null {
  const pass = sanitizeCredentialInput(password);
  const user = sanitizeCredentialInput(username);
  const minLength = clampLineCredentialMinLength(policy.minLength);
  const base = validateLineCredential(pass, "password", minLength);
  if (base) return base;
  if (policy.disallowUsernameMatch !== false && user && pass.toLowerCase() === user.toLowerCase()) {
    return "Password cannot match the username";
  }
  if (policy.blockCommonPasswords !== false && COMMON_LINE_PASSWORDS.has(pass.toLowerCase())) {
    return "Password is too common — choose a stronger one";
  }
  if (policy.requireLetterAndDigit) {
    if (!/[A-Za-z]/.test(pass) || !/[0-9]/.test(pass)) {
      return "Password must include at least one letter and one number";
    }
  }
  return null;
}
