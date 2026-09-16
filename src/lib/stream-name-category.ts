import { StreamType } from "@prisma/client";
import { categoryFromGroupName } from "@/lib/vod-category";

/** Infer M3U group-title style segment from a stream display name. */
export function inferGroupFromStreamName(name: string): string {
  const raw = name.trim();
  if (!raw) return "";

  const pipe = raw.split("|").map((s) => s.trim()).filter(Boolean);
  if (pipe.length >= 2) return pipe[0];

  const dash = raw.match(/^([^–—-]+)[–—-]\s+/);
  if (dash?.[1]?.trim()) return dash[1].trim();

  const bracket = raw.match(/^\[([^\]]+)\]/);
  if (bracket?.[1]?.trim()) return bracket[1].trim();

  const colon = raw.match(/^([A-Za-z0-9][A-Za-z0-9\s]{0,24}):\s+/);
  if (colon?.[1]?.trim()) return colon[1].trim();

  return "";
}

export async function categoryIdFromStreamName(name: string, type: StreamType): Promise<string | null> {
  const group = inferGroupFromStreamName(name);
  if (!group) return null;
  return categoryFromGroupName(group, type);
}
