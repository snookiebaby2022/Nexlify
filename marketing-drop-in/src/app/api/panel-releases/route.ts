import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

/** Canonical release feed for customer panels (Admin → Updates). */
export const dynamic = "force-dynamic";

export async function GET() {
  const filePath = join(process.cwd(), "src", "lib", "panel-releases.json");
  const data = JSON.parse(readFileSync(filePath, "utf8"));
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
