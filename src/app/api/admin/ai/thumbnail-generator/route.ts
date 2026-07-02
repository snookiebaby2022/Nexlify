import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { aiImageGenerate, isAiConfigured } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!isAiConfigured()) {
      return NextResponse.json(
        { error: "AI features require OPENAI_API_KEY. Add it to your .env file and restart the panel." },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { title, type, genre, description } = body as {
      title: string;
      type: "movie" | "series";
      genre?: string;
      description?: string;
    };

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const parts = [`Create a professional ${type === "movie" ? "movie poster" : "series poster"} for "${title}".`];
    if (genre) parts.push(`Genre: ${genre}.`);
    if (description) parts.push(`Brief concept: ${description}.`);
    parts.push("High quality, cinematic style, suitable for an IPTV streaming platform. No text overlay.");

    const prompt = parts.join(" ");
    const url = await aiImageGenerate(prompt, { size: "1024x1792", quality: "hd" });

    return NextResponse.json({ url, revisedPrompt: prompt });
  } catch (error) {
    console.error("Thumbnail generator error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
