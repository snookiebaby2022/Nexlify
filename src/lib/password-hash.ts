import bcrypt from "bcryptjs";

/** bcrypt hash for panel users / migrated lines — no Next.js or jose. */
export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}
