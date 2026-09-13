/** List payloads never include the stored password (C-05). Reveal via GET /lines/:id. */
export function listedLinePassword(_stored?: string | null): string {
  return "";
}
