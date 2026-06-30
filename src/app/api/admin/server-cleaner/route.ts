import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, CleanerTaskType, CleanerTaskStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const taskType = searchParams.get("taskType") as CleanerTaskType | null;
  const status = searchParams.get("status") as CleanerTaskStatus | null;
  const isAuto = searchParams.get("isAuto");

  const where: Record<string, unknown> = {};
  if (taskType && Object.values(CleanerTaskType).includes(taskType)) where.taskType = taskType;
  if (status && Object.values(CleanerTaskStatus).includes(status)) where.status = status;
  if (isAuto !== null) where.isAuto = isAuto === "true";

  const tasks = await prisma.serverCleanerTask.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const taskType = String(body.taskType ?? "").trim() as CleanerTaskType;
  if (!taskType || !Object.values(CleanerTaskType).includes(taskType)) {
    return NextResponse.json({ error: "Invalid task type" }, { status: 400 });
  }

  const task = await prisma.serverCleanerTask.create({
    data: {
      taskType,
      schedule: body.schedule ? String(body.schedule) : null,
      isAuto: Boolean(body.isAuto),
      status: "SCHEDULED",
      createdById: session.id,
    },
  });

  return NextResponse.json({ task });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.schedule !== undefined) data.schedule = body.schedule ? String(body.schedule) : null;
  if (body.status !== undefined) {
    const status = String(body.status) as CleanerTaskStatus;
    if (Object.values(CleanerTaskStatus).includes(status)) data.status = status;
  }
  if (body.result !== undefined) data.result = body.result ?? null;
  if (body.error !== undefined) data.error = body.error ? String(body.error) : null;
  if (body.lastRunAt !== undefined) data.lastRunAt = body.lastRunAt ? new Date(String(body.lastRunAt)) : null;
  if (body.nextRunAt !== undefined) data.nextRunAt = body.nextRunAt ? new Date(String(body.nextRunAt)) : null;

  const task = await prisma.serverCleanerTask.update({
    where: { id },
    data,
  });

  return NextResponse.json({ task });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.serverCleanerTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
