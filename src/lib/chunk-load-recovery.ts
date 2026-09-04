const CHUNK_FAIL =
  /ChunkLoadError|Loading chunk [\w.-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i;

export function isStaleChunkError(error: unknown): boolean {
  if (!error) return false;
  const msg =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : String((error as { message?: string }).message ?? error);
  return CHUNK_FAIL.test(msg);
}

/** One reload per tab session so a real bug cannot loop. */
export function reloadOnceForStaleChunks(error: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!isStaleChunkError(error)) return false;
  try {
    if (sessionStorage.getItem("nx-chunk-reload")) return false;
    sessionStorage.setItem("nx-chunk-reload", "1");
  } catch {
    /* private mode */
  }
  window.location.reload();
  return true;
}
