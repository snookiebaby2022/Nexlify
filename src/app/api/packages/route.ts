import { NextRequest } from "next/server";
import { compatLineRequest } from "@/lib/compat-lines-api";

export async function GET(req: NextRequest) {
  return compatLineRequest(req, "get_packages");
}
