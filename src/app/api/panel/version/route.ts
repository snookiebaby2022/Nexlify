import { NextResponse } from "next/server";
import { readInstalledVersion } from "@/lib/panel-version";

export async function GET() {
  try {
    const { version, name } = await readInstalledVersion();
    return NextResponse.json({ version, name });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Version check failed";
    return NextResponse.json({ error: message, version: "0.0.0" }, { status: 500 });
  }
}
