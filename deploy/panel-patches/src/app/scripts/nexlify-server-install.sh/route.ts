import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const scriptPath = path.join(process.cwd(), "scripts", "nexlify-server-install.sh");
  const body = fs.existsSync(scriptPath)
    ? fs.readFileSync(scriptPath, "utf8")
    : "#!/bin/bash\necho Nexlify install script missing\n";
  return new NextResponse(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
