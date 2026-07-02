import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  // Generate mock metrics for demo; replace with real SSH / SNMP / agent data
  const data = {
    serverId: id,
    timestamp: Date.now(),
    cpu: Math.round(20 + Math.random() * 40), // 20-60%
    ram: Math.round(30 + Math.random() * 30), // 30-60%
    disk: Math.round(40 + Math.random() * 20), // 40-60%
    networkIn: Math.round(100 + Math.random() * 500), // Mbps
    networkOut: Math.round(50 + Math.random() * 300), // Mbps
    connections: Math.round(100 + Math.random() * 400),
  };

  return NextResponse.json(data);
}
