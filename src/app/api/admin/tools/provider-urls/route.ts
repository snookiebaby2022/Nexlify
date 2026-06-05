import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole, StreamType } from "@prisma/client";
import {
  cascadeProviderStreams,
  replaceProviderBaseUrl,
  replaceStreamUrls,
} from "@/lib/provider-url-bulk";
import { probeStreamProvider } from "@/lib/stream-provider-probe";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const action = String(body.action ?? "");

  try {
    if (action === "replaceUrl") {
      const find = String(body.find ?? "").trim();
      const replace = String(body.replace ?? "");
      if (!find) {
        return NextResponse.json({ error: "find is required" }, { status: 400 });
      }
      const type = body.type ? (String(body.type) as StreamType) : undefined;
      const out = await replaceStreamUrls({
        find,
        replace,
        streamIds: body.streamIds,
        type,
        dryRun: Boolean(body.dryRun),
      });
      return NextResponse.json(out);
    }

    if (action === "cascadeProvider") {
      const providerId = String(body.providerId ?? "").trim();
      if (!providerId) {
        return NextResponse.json({ error: "providerId required" }, { status: 400 });
      }
      const out = await cascadeProviderStreams({
        providerId,
        dryRun: Boolean(body.dryRun),
      });
      return NextResponse.json(out);
    }

    if (action === "updateProviderBase") {
      const providerId = String(body.providerId ?? "").trim();
      const newBaseUrl = String(body.newBaseUrl ?? "").trim();
      if (!providerId || !newBaseUrl) {
        return NextResponse.json({ error: "providerId and newBaseUrl required" }, { status: 400 });
      }
      const probe = await probeStreamProvider(newBaseUrl);
      const out = await replaceProviderBaseUrl({
        providerId,
        newBaseUrl,
        cascadeStreams: body.cascadeStreams !== false,
        dryRun: Boolean(body.dryRun),
      });
      if (!body.dryRun) {
        await prisma.streamProvider.update({
          where: { id: providerId },
          data: {
            status: probe.status,
            statusMessage: probe.message,
            lastCheckAt: new Date(),
          },
        });
      }
      return NextResponse.json({ ...out, probe });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
