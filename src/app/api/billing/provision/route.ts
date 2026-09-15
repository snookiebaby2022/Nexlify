import { NextRequest, NextResponse } from "next/server";
import {
  runProvisioningRequest,
  type ProvisioningRequest,
} from "@/lib/billing-provisioning";

function readSecret(req: NextRequest): string | null {
  return (
    req.headers.get("x-billing-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null
  );
}

export async function GET(req: NextRequest) {
  const secret = readSecret(req);
  const result = await runProvisioningRequest({ operation: "listPackages" }, secret);
  return NextResponse.json(result, { status: result.ok ? 200 : 401 });
}

export async function POST(req: NextRequest) {
  let body: ProvisioningRequest;
  try {
    body = (await req.json()) as ProvisioningRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.operation) {
    return NextResponse.json({ ok: false, error: "operation required" }, { status: 400 });
  }
  const secret = readSecret(req);
  const result = await runProvisioningRequest(body, secret);
  const status = result.ok ? 200 : result.error === "Invalid billing webhook secret" ? 401 : 400;
  return NextResponse.json(result, { status });
}
