import type { NextRequest } from "next/server";

/**
 * Merge query + body the way XUI.one / Xtream `$_REQUEST` does.
 * POST form/JSON overlays GET; `foo[]` keys append.
 */
export async function mergeXtreamRequestParams(req: NextRequest): Promise<URLSearchParams> {
  const params = new URLSearchParams(req.nextUrl.searchParams);
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return params;

  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (ct.includes("application/json")) {
      const body = (await req.json()) as unknown;
      if (body && typeof body === "object" && !Array.isArray(body)) {
        mergeRecord(params, body as Record<string, unknown>);
      }
      return params;
    }
    if (
      ct.includes("application/x-www-form-urlencoded") ||
      ct.includes("text/plain") ||
      ct === ""
    ) {
      const text = await req.text();
      if (text.trim()) mergeFormBody(params, text);
      return params;
    }
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      for (const [key, value] of form.entries()) {
        if (typeof value !== "string") continue;
        setOrAppend(params, key, value);
      }
    }
  } catch {
    /* keep query params — XUI still authenticates from GET */
  }
  return params;
}

function mergeFormBody(params: URLSearchParams, text: string) {
  const body = new URLSearchParams(text);
  for (const [key, value] of body.entries()) {
    setOrAppend(params, key, value);
  }
}

function mergeRecord(params: URLSearchParams, body: Record<string, unknown>) {
  for (const [key, value] of Object.entries(body)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      params.delete(key);
      for (const item of value) {
        if (item == null) continue;
        params.append(key, String(item));
      }
      continue;
    }
    if (typeof value === "object") continue;
    setOrAppend(params, key, String(value));
  }
}

function setOrAppend(params: URLSearchParams, key: string, value: string) {
  if (key.endsWith("[]")) {
    params.append(key, value);
    return;
  }
  params.set(key, value);
}
