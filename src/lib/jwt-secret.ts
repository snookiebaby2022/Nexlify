export function jwtSecretBytes(): Uint8Array | null {
  const s =
    process.env.JWT_SECRET ??
    (process.env.NODE_ENV === "production" ? undefined : "dev-secret-change-me");
  if (!s) return null;
  return new TextEncoder().encode(s);
}
