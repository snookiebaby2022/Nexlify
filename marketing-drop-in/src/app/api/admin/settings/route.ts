import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSettings, saveSettings, type SiteSettings } from "@/lib/site-settings";
import { logAudit } from "@/lib/audit";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(getSettings());
}

export async function PATCH(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const allowed: (keyof SiteSettings)[] = [
    "maintenanceMode", "siteTitle", "siteDescription", "supportEmail", "salesEmail",
    "telegramUrl", "facebookUrl", "twitterUrl", "trustOperators", "trustLines",
    "trustCountries", "customHtml",
  ];

  const updates: Partial<SiteSettings> = {};
  for (const key of allowed) {
    if (key in body) {
      (updates as any)[key] = typeof body[key] === "string" ? body[key].slice(0, 2000) : body[key];
    }
  }

  const saved = saveSettings(updates);
  await logAudit({ email: user.email, action: "settings_update", detail: Object.keys(updates).join(", ") });

  return NextResponse.json(saved);
}
