import { GET as getResellers } from "@/app/api/admin/resellers/route";

/** Alias for GET /api/admin/resellers — test suites and external tools expect /users. */
export const GET = getResellers;
