export function jwtSecretBytes(): Uint8Array | null {
  const s =
    process.env.JWT_SECRET ??
    (process.env.NODE_ENV === "production" ? undefined : "dev-secret-change-me");
  if (!s || s.trim() === "") return null;
  return new TextEncoder().encode(s);
}

const WEAK_JWT_PATTERNS = [
  /^dev-secret/i,
  /^change-me/i,
  /^secret$/i,
  /^password$/i,
  /^jwt[_-]?secret$/i,
];

/** null = OK; string = user-facing misconfiguration message. */
export function jwtSecretStrengthError(secret?: string | null): string | null {
  const s = secret?.trim() ?? process.env.JWT_SECRET?.trim() ?? "";
  if (!s) return "JWT_SECRET is not set";
  if (s.length < 32) return "JWT_SECRET must be at least 32 characters";
  if (WEAK_JWT_PATTERNS.some((re) => re.test(s))) return "JWT_SECRET is too weak — use a random 32+ char value";
  return null;
}
