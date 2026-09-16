import { Prisma } from "@prisma/client";

const IP_LIKE = /^(?:\d{1,3}\.){3}\d{1,3}$|^[a-f0-9:]+$/i;

function metaPathContains(path: string[], q: string): Prisma.ActivityLogWhereInput {
  return {
    meta: {
      path,
      string_contains: q,
    } as Prisma.JsonNullableFilter,
  };
}

/** Activity log filters including JSON meta (IP, username) for login logs. */
export function buildActivityLogWhere(opts: {
  actionFilter?: string;
  q?: string;
}): Prisma.ActivityLogWhereInput {
  const actionFilter = opts.actionFilter?.trim();
  const q = opts.q?.trim();
  const where: Prisma.ActivityLogWhereInput = {};

  if (actionFilter) {
    where.action = { contains: actionFilter, mode: "insensitive" };
  }

  if (q) {
    const or: Prisma.ActivityLogWhereInput[] = [
      { entity: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
      { user: { username: { contains: q, mode: "insensitive" } } },
      { line: { username: { contains: q, mode: "insensitive" } } },
      { action: { contains: q, mode: "insensitive" } },
      metaPathContains(["ip"], q),
      metaPathContains(["username"], q),
      metaPathContains(["lineUsername"], q),
      metaPathContains(["userAgent"], q),
    ];
    if (IP_LIKE.test(q)) {
      or.push(metaPathContains(["ip"], q));
    }
    where.OR = or;
  }

  return where;
}
