import type { LineWithBouquets } from "./lines";
import { prisma } from "./prisma";

export async function getLineByCredentialsExtended(
  username: string,
  password: string
): Promise<LineWithBouquets | null> {
  const include = {
    bouquets: {
      include: {
        bouquet: {
          include: {
            streams: { include: { stream: true } },
          },
        },
      },
    },
  } as const;

  const line = await prisma.line.findUnique({
    where: { username },
    include,
  });
  if (line && line.password === password) return line;

  const code = username.trim().toUpperCase();
  if (!code) return null;

  const activeLine = await prisma.line.findFirst({
    where: {
      activeCode: code,
      authMode: "ACTIVE_CODE",
    },
    include,
  });
  if (!activeLine) return null;

  if (password && password !== activeLine.password && password !== code) return null;
  return activeLine;
}
