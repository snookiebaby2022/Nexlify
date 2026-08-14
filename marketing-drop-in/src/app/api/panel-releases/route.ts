import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/** Canonical release feed for customer panels (Admin → Updates). */
export const dynamic = "force-dynamic";

function readFeedFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!existsSync(filePath)) return null;
    const data = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    if (!data || !Array.isArray(data.releases)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function GET() {
  const root = process.cwd();
  // public/ can be uploaded without a Next rebuild; src/lib is the built-in copy.
  const data =
    readFeedFile(join(root, "public", "panel-releases.json")) ??
    readFeedFile(join(root, "src", "lib", "panel-releases.json"));
  if (!data) {
    return NextResponse.json({ error: "Release feed missing" }, { status: 500 });
  }
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
