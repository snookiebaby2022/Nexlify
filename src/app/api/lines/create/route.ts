import { NextRequest } from "next/server";
import { compatLineRequest } from "@/lib/compat-lines-api";

export async function POST(req: NextRequest) {
  return compatLineRequest(req, "create_line");
}
