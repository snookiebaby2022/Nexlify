import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

type SignupRow = { email: string; signedUpAt: string };

async function readSignupsFromLog(): Promise<SignupRow[]> {
  const logPath = path.join(process.cwd(), "data", "newsletter-subscribers.log");
  try {
    const raw = await readFile(logPath, "utf8");
    const rows: SignupRow[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const tab = trimmed.indexOf("\t");
      if (tab === -1) continue;
      rows.push({
        signedUpAt: trimmed.slice(0, tab),
        email: trimmed.slice(tab + 1).trim().toLowerCase(),
      });
    }
    return rows.reverse();
  } catch {
    return [];
  }
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const signups = await readSignupsFromLog();
  const unique = new Map<string, SignupRow>();
  for (const s of signups) {
    if (!unique.has(s.email)) unique.set(s.email, s);
  }

  return NextResponse.json({
    signups: [...unique.values()],
    storage: process.env.NEWSLETTER_WEBHOOK_URL ? "webhook" : "file",
    total: unique.size,
  });
}
