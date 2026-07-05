import { NextRequest, NextResponse } from "next/server";
import { getOnlineAdmins, addCollabNote, resolveCollabNote, getCollabNotes, addCollabTask, updateCollabTask, getCollabTasks } from "@/lib/collaboration";
import { iptvCorsPreflight } from "@/lib/iptv-cors";

export async function OPTIONS() { return iptvCorsPreflight(); }

export async function GET(req: NextRequest) {
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
  const body = await req.json();
  try {
    if (body.action === "add-note") {
      return NextResponse.json(await addCollabNote(body.authorId, body.authorName, body.content, body.streamId));
    }
    if (body.action === "resolve-note") {
      return NextResponse.json({ ok: await resolveCollabNote(body.noteId) });
    }
    if (body.action === "add-task") {
      return NextResponse.json(await addCollabTask(body.title, body.assignedTo, body.createdBy, body.priority));
    }
    if (body.action === "update-task") {
      return NextResponse.json({ ok: await updateCollabTask(body.taskId, body.updates) });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
