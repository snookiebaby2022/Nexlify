/** Notes that describe a successful parse — not problems. */
export function isMigrationParseNote(message: string): boolean {
  const w = message.trim();
  const mapped = w.match(/^Mapped (\d+) of (\d+) stream row/);
  if (mapped) {
    const got = Number(mapped[1]);
    const total = Number(mapped[2]);
    return total > 0 && got / total >= 0.95;
  }
  return (
    w.startsWith("Applied CREATE TABLE column names") ||
    w.startsWith("Auto-mapped ") ||
    w.startsWith("Guessed type ") ||
    w.startsWith("Content breakdown:") ||
    w.startsWith("Tagged ") ||
    w.startsWith("Created ") ||
    w.startsWith("Capped ") ||
    w.startsWith("Extended import") ||
    w.startsWith("Applied server_id") ||
    w.startsWith("Merged ") ||
    w.startsWith("streams_episodes has ")
  );
}

export function splitMigrationMessages(messages: string[]): { notes: string[]; warnings: string[] } {
  const notes: string[] = [];
  const warnings: string[] = [];
  for (const m of messages) {
    if (isMigrationParseNote(m)) notes.push(m);
    else warnings.push(m);
  }
  return { notes, warnings };
}
