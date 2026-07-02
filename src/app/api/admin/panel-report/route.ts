import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/lines";
import { panelReportRecipient, sendPanelEmail, type PanelEmailAttachment } from "@/lib/panel-email";
import { buildPanelReport } from "@/lib/panel-report";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

const COOLDOWN_MS = 5 * 60 * 1000;
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export async function POST(req: NextRequest) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cooldownKey = `panel_report_last_${session.id}`;
  const last = await prisma.panelSetting.findUnique({ where: { key: cooldownKey } });
  if (last?.value) {
    const lastAt = Number(last.value);
    if (Number.isFinite(lastAt) && Date.now() - lastAt < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - (Date.now() - lastAt)) / 1000);
      return NextResponse.json(
        { error: `Please wait ${waitSec}s before sending another report.` },
        { status: 429 }
      );
    }
  }

  const contentType = req.headers.get("content-type") ?? "";
  let note = "";
  let page = "";
  let imageFiles: File[] = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    note = String(form.get("note") ?? "").slice(0, 4000);
    page = String(form.get("page") ?? "").slice(0, 500);
    imageFiles = form
      .getAll("images")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  } else {
    const body = await req.json().catch(() => ({}));
    note = typeof body.note === "string" ? body.note.slice(0, 4000) : "";
    page = typeof body.page === "string" ? body.page.slice(0, 500) : "";
  }

  note = note.trim();
  if (!note) {
    return NextResponse.json({ error: "Please describe the issue before sending." }, { status: 400 });
  }

  if (imageFiles.length > MAX_IMAGES) {
    return NextResponse.json({ error: `You can attach up to ${MAX_IMAGES} images.` }, { status: 400 });
  }

  const attachments: PanelEmailAttachment[] = [];
  for (const file of imageFiles) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, GIF, and WebP images are allowed." },
        { status: 400 }
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `Each image must be ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))}MB or smaller.` },
        { status: 400 }
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    attachments.push({
      filename: file.name || "screenshot",
      content: buffer,
      contentType: file.type,
    });
  }

  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "panel").split(",")[0].trim();
  const clientIp =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "";

  try {
    const report = await buildPanelReport({
      session,
      host,
      page,
      note,
      clientIp,
      attachmentCount: attachments.length,
    });
    const to = panelReportRecipient();
    await sendPanelEmail({
      to,
      subject: report.subject,
      text: report.text,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    await prisma.panelSetting.upsert({
      where: { key: cooldownKey },
      create: { key: cooldownKey, value: String(Date.now()) },
      update: { value: String(Date.now()) },
    });

    await logActivity("panel_report_sent", {
      meta: { to, page: page || "/", images: attachments.length },
    });

    return NextResponse.json({ ok: true, to });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send report";
    console.error("[panel-report]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
