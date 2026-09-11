/** Progress events streamed as NDJSON during long admin imports. */
export type ImportProgressEvent = {
  phase: string;
  message: string;
  current?: number;
  total?: number;
  imported?: number;
  skipped?: number;
  updated?: number;
  epgAssigned?: number;
  errors?: string[];
};

export type ImportProgressReporter = (event: ImportProgressEvent) => void;

export function ndjsonImportResponse(
  run: (report: ImportProgressReporter) => Promise<ImportProgressEvent>
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const report: ImportProgressReporter = (event) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const finalEvent = await run(report);
        report({ ...finalEvent, phase: finalEvent.phase === "error" ? "error" : "done" });
      } catch (e) {
        report({
          phase: "error",
          message: e instanceof Error ? e.message : "Import failed",
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export type ImportProgressState = {
  phase: string;
  message: string;
  current: number;
  total: number;
  imported?: number;
  skipped?: number;
};

export function progressPercent(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
}

/** POST with streamProgress: true — reads NDJSON lines until done or error. */
export async function postAdminImportWithProgress(
  endpoint: string,
  body: Record<string, unknown>,
  onEvent: (event: ImportProgressEvent) => void
): Promise<ImportProgressEvent> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, streamProgress: true }),
  });

  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("ndjson")) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "Import failed");
    }
    const done: ImportProgressEvent = {
      phase: "done",
      message: "Complete",
      imported: data.imported,
      skipped: data.skipped,
      updated: data.updated,
      errors: data.errors,
    };
    onEvent(done);
    return done;
  }

  if (!res.body) throw new Error("Empty import response");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let last: ImportProgressEvent = { phase: "running", message: "Importing…" };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = JSON.parse(trimmed) as ImportProgressEvent;
      last = event;
      onEvent(event);
      if (event.phase === "error") {
        throw new Error(event.message || "Import failed");
      }
    }
  }

  if (last.phase !== "done") {
    throw new Error("Import ended unexpectedly — refresh and check streams.");
  }
  return last;
}
