import OpenAI from "openai";

let client: OpenAI | null = null;

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("AI features require OPENAI_API_KEY. Add it to your .env file and restart the panel.");
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function aiChat(
  messages: ChatMessage[],
  opts?: { model?: string; maxTokens?: number; temperature?: number }
): Promise<string> {
  const openai = getClient();
  const res = await openai.chat.completions.create({
    model: opts?.model ?? "gpt-4o-mini",
    messages,
    max_tokens: opts?.maxTokens ?? 2048,
    temperature: opts?.temperature ?? 0.7,
  });
  return res.choices[0]?.message?.content ?? "";
}

export async function aiChatJSON<T = unknown>(
  messages: ChatMessage[],
  opts?: { model?: string; maxTokens?: number; temperature?: number }
): Promise<T> {
  const text = await aiChat(messages, { ...opts, temperature: opts?.temperature ?? 0.2 });
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/^(\{[\s\S]*\})$/);
  const raw = jsonMatch ? jsonMatch[1].trim() : text.trim();
  return JSON.parse(raw) as T;
}

export async function aiEmbeddings(texts: string[]): Promise<number[][]> {
  const openai = getClient();
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

export async function aiImageGenerate(
  prompt: string,
  opts?: { size?: "1024x1024" | "1024x1792" | "1792x1024"; quality?: "standard" | "hd" }
): Promise<string> {
  const openai = getClient();
  const res = await openai.images.generate({
    model: "dall-e-3",
    prompt,
    size: opts?.size ?? "1024x1024",
    quality: opts?.quality ?? "standard",
    n: 1,
  });
  return res.data?.[0]?.url ?? "";
}

export async function aiTranscribe(audioBuffer: Buffer, filename: string): Promise<string> {
  const openai = getClient();
  const file = new File([audioBuffer], filename, { type: "audio/webm" });
  const res = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
  });
  return res.text;
}
