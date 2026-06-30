import { NextResponse } from "next/server";
import { readInstalledVersion } from "@/lib/panel-version";

export async function GET() {
  const { version } = await readInstalledVersion(process.cwd());
  return NextResponse.json({ version });
}
