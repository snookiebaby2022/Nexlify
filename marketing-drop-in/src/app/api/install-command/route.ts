import { readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";

/** Always compute install URL at request time — never rely on stale client bundle. */
function getInstallCommand() {
  let version = "1.9.7";
  try {
    const raw = readFileSync(join(process.cwd(), "src/lib/panel-releases.json"), "utf-8");
    const releases = JSON.parse(raw) as { latestVersion?: string };
    if (releases.latestVersion?.trim()) version = releases.latestVersion.trim();
  } catch {
    try {
      const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8")) as {
        version?: string;
      };
      if (pkg.version?.trim()) version = pkg.version.trim();
    } catch {
      /* use default */
    }
  }

  const url = `https://nexlify.live/install/panel.sh?v=${version}`;
  const command = `curl -fsSL '${url}' | sudo bash`;
  return { version, url, command, label: `v${version}` };
}

export async function GET() {
  const data = getInstallCommand();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
