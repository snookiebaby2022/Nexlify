/** Abort/cancel races close a Web ReadableStream while Node still pushes chunks. */
function isClosedController(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  return (
    e.code === "ERR_INVALID_STATE" ||
    /Controller is already closed|Invalid state.*Controller/i.test(String(e.message ?? ""))
  );
}

type Patchable = {
  enqueue: (...args: unknown[]) => unknown;
  close?: () => unknown;
  __nexlifyWebStreamPatched?: boolean;
};

function patchControllerProto(proto: Patchable) {
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

  if (typeof proto.close === "function") {
    const origClose = proto.close;
    proto.close = function () {
      try {
        return origClose.call(this);
      } catch (err) {
        if (isClosedController(err)) return;
      }
    };
  }
}

/** Stop live/HLS abort races from becoming process-killing uncaughtException. */
export function installBenignWebStreamGuards(): void {
  const readable = (globalThis as unknown as { ReadableStreamDefaultController?: { prototype: Patchable } })
    .ReadableStreamDefaultController;
  if (readable?.prototype) patchControllerProto(readable.prototype);
}

export function isBenignWebStreamClose(err: unknown): boolean {
  return isClosedController(err);
}
