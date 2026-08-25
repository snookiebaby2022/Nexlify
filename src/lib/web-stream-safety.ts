/** Abort/cancel races close a Web ReadableStream while Node still pushes chunks. */
function isClosedController(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string; name?: string };
  return (
    e.code === "ERR_INVALID_STATE" ||
    e.name === "TypeError" && /Controller is already closed/i.test(String(e.message ?? ""))
  );
}

function patchControllerProto(proto: { enqueue: (...args: unknown[]) => unknown; close: () => unknown; error?: (e?: unknown) => unknown } & { __nexlifyWebStreamPatched?: boolean }) {
  if (proto.__nexlifyWebStreamPatched) return;
  proto.__nexlifyWebStreamPatched = true;

  const origEnqueue = proto.enqueue;
  proto.enqueue = function (...args: unknown[]) {
    try {
      return origEnqueue.apply(this, args);
    } catch (err) {
      if (isClosedController(err)) return;
      throw err;
    }
  };

  const origClose = proto.close;
  proto.close = function () {
    try {
      return origClose.call(this);
    } catch (err) {
      if (isClosedController(err)) return;
    }
  };
}

/** Stop live/HLS abort races from becoming process-killing uncaughtException. */
export function installBenignWebStreamGuards(): void {
  const readable = (globalThis as { ReadableStreamDefaultController?: { prototype: Parameters<typeof patchControllerProto>[0] } })
    .ReadableStreamDefaultController;
  if (readable?.prototype) patchControllerProto(readable.prototype);

  const transform = (globalThis as { TransformStreamDefaultController?: { prototype: Parameters<typeof patchControllerProto>[0] } })
    .TransformStreamDefaultController;
  if (transform?.prototype) patchControllerProto(transform.prototype);
}

export function isBenignWebStreamClose(err: unknown): boolean {
  return isClosedController(err);
}
