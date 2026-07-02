import { NextResponse } from "next/server";
import { getViewerCount, isValidViewerId, removeViewer } from "@/lib/livestream-viewers";

export const dynamic = "force-dynamic";

/** Remove a viewer when they leave the page (sendBeacon). */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id : "";
    if (isValidViewerId(id)) removeViewer(id);
  } catch {
    /* ignore malformed body */
  }

  return NextResponse.json({ viewers: getViewerCount() });
}
