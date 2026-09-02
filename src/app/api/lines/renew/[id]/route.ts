import { NextRequest } from "next/server";
import { compatLineRequest } from "@/lib/compat-lines-api";

type Context = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return compatLineRequest(req, "renew_line", id);
}
