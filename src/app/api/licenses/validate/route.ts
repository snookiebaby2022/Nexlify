import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePanelApiKey } from "@/lib/auth";
import { validateLicenseKey } from "@/lib/licensing";

const schema = z.object({
  key: z.string().min(10),
  machineId: z.string().optional(),
});

export async function POST(request: Request) {
  if (!requirePanelApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());
    const result = await validateLicenseKey(body.key, body.machineId);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Validation failed" }, { status: 500 });
  }
}
