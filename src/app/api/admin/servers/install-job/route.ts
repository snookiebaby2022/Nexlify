import { after, NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  createInstallJob,
  getInstallJob,
  pruneInstallJobs,
} from "@/lib/server-install-job";
import { runRemoteServerInstall } from "@/lib/server-remote-install";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

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
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    pruneInstallJobs();
    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const panelUrl = String(body.panelUrl ?? process.env.NEXT_PUBLIC_SERVER_URL ?? "").replace(
      /\/$/,
      ""
    );
    const serverName = String(body.serverName ?? "Stream-1");
    const host = String(body.host ?? "").trim();
    const sshPort = String(body.sshPort ?? "22").trim() || "22";
    const sshUser = String(body.sshUser ?? "root").trim() || "root";
    const sshPassword = String(body.sshPassword ?? body.agentSshPassword ?? "");
    const updateSysctl = body.updateSysctl !== false;

    if (!host) return NextResponse.json({ error: "Server IP is required" }, { status: 400 });
    if (!sshPassword) {
      return NextResponse.json(
        { error: "SSH password is required to install from the panel" },
        { status: 400 }
      );
    }

    const jobId = createInstallJob();
    after(() => {
      void runRemoteServerInstall(jobId, {
        panelUrl,
        host,
        serverName,
        sshPort,
        sshUser,
        sshPassword,
        updateSysctl,
      });
    });

    return NextResponse.json({ jobId });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
