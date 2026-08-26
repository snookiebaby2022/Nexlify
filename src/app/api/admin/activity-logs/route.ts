import { GET as getLogs, DELETE as deleteLogs } from "@/app/api/admin/logs/route";

/** Alias for GET /api/admin/logs — Xtream-style activity_logs naming. */
export const GET = getLogs;
export const DELETE = deleteLogs;
