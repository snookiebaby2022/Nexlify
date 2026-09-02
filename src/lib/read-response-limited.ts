const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

export async function readResponseTextLimited(
  response: Response,
  maxBytes = DEFAULT_MAX_BYTES
): Promise<string> {
  const advertised = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(advertised) && advertised > maxBytes) {
    throw new Error("Remote response is too large");
  }
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) throw new Error("Remote response is too large");
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) throw new Error("Remote response is too large");
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}
