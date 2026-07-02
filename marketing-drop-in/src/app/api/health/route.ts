import { NextResponse } from "next/server";

export async function GET() {
  const api =
    process.env.NEXLIFY_LICENSE_API_URL?.trim().replace(/\/$/, "") ?? "http://127.0.0.1:8787";

  try {
    const res = await fetch(`${api}/health`, { cache: "no-store" });
    const data = (await res.json()) as { ok?: boolean; service?: string };
    return NextResponse.json({
      ok: res.ok && data.ok !== false,
      service: "nexlify-license",
      upstream: data,
    });
  } catch {
    return NextResponse.json(
      { ok: false, service: "nexlify-license", error: "License API unreachable" },
      { status: 503 },
    );
  }
}
