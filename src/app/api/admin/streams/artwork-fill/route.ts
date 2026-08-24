import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import {
  loadArtworkFillProgress,
  requestArtworkFillCancel,
  startArtworkFillJob,
  type ArtworkFillMode,
  type ArtworkFillType,
} from "@/lib/artwork-fill-progress";
import { runArtworkFillJob, artworkFillRunnerBusy } from "@/lib/artwork-fill-runner";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const progress = await loadArtworkFillProgress();
  return NextResponse.json({ progress, busy: artworkFillRunnerBusy() });
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const action = String(body.action ?? "start").toLowerCase();
    if (action === "cancel") {
      await requestArtworkFillCancel();
      const progress = await loadArtworkFillProgress();
      return NextResponse.json({ ok: true, progress });
    }

    const mode: ArtworkFillMode = body.mode === "fast" ? "fast" : "full";
    const typeRaw = String(body.type ?? "ALL").toUpperCase();
    const types: ArtworkFillType[] =
      typeRaw === "LIVE"
        ? ["LIVE"]
        : typeRaw === "MOVIE"
          ? ["MOVIE"]
          : typeRaw === "SERIES"
            ? ["SERIES"]
            : ["ALL"];

    const started = await startArtworkFillJob({ mode, types });
    if (started.alreadyRunning) {
      return NextResponse.json({
        ok: true,
        alreadyRunning: true,
        progress: started.progress,
      });
    }

    void runArtworkFillJob({ jobId: started.jobId, mode, types });

    return NextResponse.json({
      ok: true,
      jobId: started.jobId,
      progress: started.progress,
    });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
