import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWhmcsApiKey } from "@/lib/whmcs-auth";
import { licensePayload } from "@/lib/whmcs";

export async function GET(request: Request) {
  if (!requireWhmcsApiKey(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const serviceId = new URL(request.url).searchParams.get("serviceId");
  if (!serviceId) {
    return NextResponse.json({ success: false, error: "serviceId required" }, { status: 400 });
  }

  const license = await prisma.license.findUnique({
    where: { whmcsServiceId: serviceId },
    include: { plan: true },
  });

  if (!license) {
    return NextResponse.json({ success: false, error: "License not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, ...licensePayload(license) });
}
