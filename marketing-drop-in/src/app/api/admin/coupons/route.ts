import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

const PANEL_URL = process.env.NEXT_PUBLIC_PANEL_URL || "https://panel.nexlify.live";
const PANEL_API_SECRET = process.env.PANEL_API_SECRET || process.env.NEXLIFY_PANEL_API_SECRET || "";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

async function panelFetch(path: string, opts?: RequestInit) {
  return fetch(`${PANEL_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "x-panel-api-key": PANEL_API_SECRET,
      ...opts?.headers,
    },
  });
}

export async function GET(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (code) {
    const res = await panelFetch(`/api/billing/coupon?code=${encodeURIComponent(code)}`);
    const data = await res.json();
    return NextResponse.json(data);
  }

  const res = await panelFetch("/api/billing/coupon");
  const data = await res.json();
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const res = await panelFetch("/api/billing/coupon", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const res = await panelFetch("/api/billing/coupon", {
    method: "PUT",
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const res = await panelFetch(`/api/billing/coupon?code=${encodeURIComponent(code)}`, {
    method: "DELETE",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
