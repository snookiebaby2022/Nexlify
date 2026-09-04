import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { jwtSecretBytes } from "@/lib/jwt-secret";
import { resolvePanelRepoPathSync } from "@/lib/panel-repo-path";
import { isJobRunning, isPanelUpdateWorkAlive, readUpdateJob } from "@/lib/panel-update-job";
import { readInstalledVersion } from "@/lib/panel-version";

/** JWT-only poll so the progress bar survives Prisma / DB outages during an update. */
export async function GET() {
  const secret = jwtSecretBytes();
  if (!secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = (await cookies()).get("nexlify_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let role = "";
  try {
    const { payload } = await jwtVerify(token, secret);
    role = String(payload.role ?? "");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const repoPath = resolvePanelRepoPathSync(process.env.PANEL_REPO_PATH);
  const job = await readUpdateJob(repoPath);
  const { version: installedVersion } = await readInstalledVersion(repoPath);
  const updateRunning = isJobRunning(job) || (await isPanelUpdateWorkAlive(repoPath));

  return NextResponse.json(
    {
      version: { installedVersion },
      job,
      updateRunning,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    }
  );
}
