import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateActivationCode } from "@/lib/activation-code";
import { sendActivationCodeEmail } from "@/lib/activation-email";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

const schema = z.object({
  licenseKey: z.string().min(20),
});

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`send-code:${ip}`, 10, 60 * 60 * 1000);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  try {
    const body = schema.parse(await request.json());
    const license = await prisma.license.findUnique({
      where: { key: body.licenseKey.trim() },
      include: {
        user: { select: { id: true, email: true, name: true } },
        plan: { select: { name: true } },
      },
    });
    if (!license) {
      return NextResponse.json({ ok: false, error: "License not found" }, { status: 404 });
    }

    const code = await generateActivationCode(
      license.id,
      license.userId,
      license.user.email
    );
    await sendActivationCodeEmail(
      license.user.email,
      license.user.name,
      code,
      license.id
    );

    const masked = license.user.email.replace(/(.{2})(.*)(@.*)/, "$1***$3");
    return NextResponse.json({ ok: true, email: masked });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "Failed to send code" }, { status: 500 });
  }
}
