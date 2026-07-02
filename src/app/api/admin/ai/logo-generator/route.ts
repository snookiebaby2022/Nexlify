import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { aiImageGenerate } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { channelName, style } = body as { channelName: string; style?: string };

    if (!channelName || typeof channelName !== "string") {
      return NextResponse.json({ error: "Channel name is required" }, { status: 400 });
    }

    const stylePrompt = style ?? "modern, clean, minimalist";
    const prompt = `Create a professional TV channel logo for "${channelName}". Style: ${stylePrompt}. The logo should be suitable for an IPTV channel, with a transparent-friendly design, bold and recognizable. No text other than the channel name.`;

    const url = await aiImageGenerate(prompt, { size: "1024x1024", quality: "hd" });

    return NextResponse.json({ url, revisedPrompt: prompt });
  } catch (error) {
    console.error("Logo generator error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
