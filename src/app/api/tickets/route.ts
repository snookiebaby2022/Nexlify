import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  subject: z.string().min(3).max(200),
  message: z.string().min(10).max(10000),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const where = user.role === "ADMIN" ? {} : { userId: user.id };

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { email: true, name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { author: { select: { email: true, name: true, role: true } } },
      },
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({ tickets });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = createSchema.parse(await request.json());

    const ticket = await prisma.ticket.create({
      data: {
        userId: user.id,
        subject: body.subject,
        priority: body.priority ?? "NORMAL",
        messages: {
          create: {
            authorId: user.id,
            body: body.message,
            isStaff: false,
          },
        },
      },
      include: {
        messages: true,
      },
    });

    return NextResponse.json({ ticket });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
  }
}
