import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { generateAgentToken } from "@/lib/stream-agent";
import fs from "fs";
import path from "path";
import {
  createInstallJob,
  getInstallJob,
  pruneInstallJobs,
  runInstallJobSimulation,
} from "@/lib/server-install-job";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  const job = getInstallJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  return NextResponse.json({
    progress: job.progress,
    step: job.step,
    logs: job.logs,
    done: job.done,
    error: job.error,
    result: job.result,
  });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  pruneInstallJobs();
  const body = await req.json();
  const panelUrl = String(body.panelUrl ?? process.env.NEXT_PUBLIC_SERVER_URL ?? "").replace(/\/$/, "");
  const serverName = String(body.serverName ?? "Stream-1");
  const host = String(body.host ?? "").trim();
  const sshPort = String(body.sshPort ?? "22").trim() || "22";
  const sshUser = String(body.sshUser ?? "root").trim() || "root";

  const jobId = createInstallJob();

  const logLines = host
    ? [
        `Connecting to ${host}:${sshPort}`,
        `Connected! Authenticating as ${sshUser} user`,
        "Stopping any previous Nexlify agent",
        "Updating system packages",
        "Installing FFmpeg and nginx",
        "Configuring stream agent token",
        "Preparing bootstrap script",
      ]
    : ["Validating panel URL…", "Preparing agent token…"];

  runInstallJobSimulation(
    jobId,
    async () => {
    const token = generateAgentToken();
    const scriptPath = path.join(process.cwd(), "scripts", "nexlify-server-install.sh");
    let script = "";
    if (fs.existsSync(scriptPath)) {
      script = fs.readFileSync(scriptPath, "utf8");
    }
    const installCommand = panelUrl
      ? `curl -fsSL ${panelUrl}/scripts/nexlify-server-install.sh | sudo PANEL_URL="${panelUrl}" AGENT_TOKEN="${token}" bash`
      : "";

    return {
      serverName,
      host,
      agentToken: token,
      panelUrl,
      installCommand,
      script,
      steps: [
        "SSH into the stream VPS as root",
        "Run the install command below",
        "In Nexlify Admin → Servers → Add server, enter host and paste agent token",
        "Save server — agent should appear online within 1–2 minutes",
      ],
    };
  },
    logLines
  );

  return NextResponse.json({ jobId });
}
