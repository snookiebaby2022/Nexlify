import { NextRequest } from "next/server";
import { handleEnigma2Request } from "@/lib/enigma2-api";
import { rejectDemoIptvPlayback } from "@/lib/iptv-route-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const demoBlock = rejectDemoIptvPlayback(req);
  if (demoBlock) return demoBlock;
  return handleEnigma2Request(req);
}

export async function POST(req: NextRequest) {
  const demoBlock = rejectDemoIptvPlayback(req);
  if (demoBlock) return demoBlock;
  return handleEnigma2Request(req);
}
