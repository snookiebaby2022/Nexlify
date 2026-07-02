export function normalizeEnigmaMac(raw: string): string {
  const hex = raw.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (hex.length !== 12) return "";
  return hex.match(/.{2}/g)!.join(":");
}
