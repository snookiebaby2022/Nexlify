import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  createTranscodingProfile,
  getTranscodingProfiles,
  deleteTranscodingProfile,
} from "@/lib/transcoding-profiles";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const profiles = await getTranscodingProfiles();
  return NextResponse.json({ profiles });
}

export async function POST(req: Request) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action, name, resolution, bitrate, codec, gpuAcceleration, profileId } = await req.json();

  if (action === "create") {
    const profile = await createTranscodingProfile(name, resolution, bitrate, codec, gpuAcceleration);
    return NextResponse.json(profile);
  }

  if (action === "delete") {
    await deleteTranscodingProfile(profileId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
