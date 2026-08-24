import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { getOnlineAdmins, addCollabNote, resolveCollabNote, getCollabNotes, addCollabTask, updateCollabTask, getCollabTasks } from "@/lib/collaboration";
import { iptvCorsPreflight } from "@/lib/iptv-cors";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
export async function OPTIONS() { return iptvCorsPreflight(); }

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");
  try {
    if (action === "online") return NextResponse.json(await getOnlineAdmins());
    if (action === "notes") {
      const streamId = sp.get("streamId") ?? undefined;
      return NextResponse.json(await getCollabNotes(streamId));
    }
    if (action === "tasks") {
      const assignedTo = sp.get("assignedTo") ?? undefined;
      return NextResponse.json(await getCollabTasks(assignedTo));
    }
    return NextResponse.json({ online: await getOnlineAdmins(), notes: await getCollabNotes(), tasks: await getCollabTasks() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
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

  try {
    if (body.action === "add-note") {
      return NextResponse.json(await addCollabNote(session.id, session.username, body.content, body.streamId));
    }
    if (body.action === "resolve-note") {
      return NextResponse.json({ ok: await resolveCollabNote(body.noteId) });
    }
    if (body.action === "add-task") {
      return NextResponse.json(await addCollabTask(body.title, body.assignedTo, session.id, body.priority));
    }
    if (body.action === "update-task") {
      return NextResponse.json({ ok: await updateCollabTask(body.taskId, body.updates) });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
