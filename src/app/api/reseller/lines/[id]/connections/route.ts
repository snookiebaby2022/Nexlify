type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, ctx: Ctx) {
  const { DELETE: adminDELETE } = await import("../../../../admin/lines/[id]/connections/route");
  return adminDELETE(req, ctx);
}
