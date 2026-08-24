/** Let HTTP/health handlers run between large catalog/EPG batches. */
export function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
