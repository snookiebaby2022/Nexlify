import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function GET(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const post = await prisma.blogPost.findUnique({ where: { id } });
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(post);
  }

  const posts = await prisma.blogPost.findMany({
    orderBy: { datePublished: "desc" },
    select: { id: true, slug: true, title: true, tag: true, published: true, datePublished: true, updatedAt: true, excerpt: true },
  });
  return NextResponse.json(posts);
}

export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { slug, title, excerpt, content, tag, seoTitle, seoDescription, keywords, published } = body;

  if (!slug || !title || !content) {
    return NextResponse.json({ error: "slug, title, and content are required" }, { status: 400 });
  }

  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  try {
    const post = await prisma.blogPost.create({
      data: {
        slug: cleanSlug,
        title,
        excerpt: excerpt || "",
        content,
        tag: tag || null,
        seoTitle: seoTitle || null,
        seoDescription: seoDescription || null,
        keywords: keywords || null,
        published: !!published,
      },
    });

    await logAudit({ email: user.email, action: "blog_create", detail: post.slug });
    return NextResponse.json(post, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }
    throw err;
  }
}

export async function PATCH(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  if (updates.slug) {
    updates.slug = updates.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }

  try {
    const post = await prisma.blogPost.update({ where: { id }, data: updates });
    await logAudit({ email: user.email, action: "blog_update", detail: post.slug });
    return NextResponse.json(post);
  } catch (err: any) {
    if (err?.code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw err;
  }
}

export async function DELETE(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const post = await prisma.blogPost.delete({ where: { id } });
    await logAudit({ email: user.email, action: "blog_delete", detail: post.slug });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw err;
  }
}
