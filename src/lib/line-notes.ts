export type LineNotesViewer = "admin" | "reseller";

/** Split combined line notes for the editor viewing them. */
export function splitLineNotes(
  notes: string | null | undefined,
  viewer: LineNotesViewer = "admin"
): { admin: string; reseller: string } {
  if (!notes?.trim()) return { admin: "", reseller: "" };
  const parts = notes.split("\n---\n");
  if (parts.length >= 2) {
    return {
      admin: parts[0]?.trim() ?? "",
      reseller: parts.slice(1).join("\n---\n").trim(),
    };
  }
  const single = parts[0]?.trim() ?? "";
  // Legacy rows: reseller-only text with no delimiter.
  if (viewer === "reseller") return { admin: "", reseller: single };
  return { admin: single, reseller: "" };
}

export function mergeResellerNotes(
  existing: string | null | undefined,
  reseller: string
): string {
  const trimmed = reseller.trim();
  const { admin } = splitLineNotes(existing, "admin");
  if (!trimmed) return admin;
  if (admin) return `${admin}\n---\n${trimmed}`;
  return trimmed;
}

export function mergeLineNotesForSave(
  panel: LineNotesViewer,
  existing: string | null | undefined,
  adminNotes: string,
  resellerNotes: string
): string | null {
  const admin = adminNotes.trim();
  const reseller = resellerNotes.trim();
  if (panel === "reseller") {
    const merged = mergeResellerNotes(existing, reseller);
    return merged || null;
  }
  if (admin && reseller) return `${admin}\n---\n${reseller}`;
  return admin || reseller || null;
}
