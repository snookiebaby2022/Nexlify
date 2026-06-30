import { SignJWT, jwtVerify } from "jose";
import type { LicensePayloadV1 } from "./types";

const COOKIE = "nexlify_license_session";

function secret() {
  const s = process.env.JWT_SECRET ?? process.env.LICENSE_SESSION_SECRET;
  if (!s || s === "dev-secret-change-me") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Set JWT_SECRET before using license enforcement in production");
    }
  }
  return new TextEncoder().encode(s ?? "dev-secret-change-me");
}

export async function issueLicenseSessionCookie(payload: LicensePayloadV1, instanceId: string) {
  const exp = payload.exp;
  const token = await new SignJWT({
    lid: payload.lid,
    tier: payload.tier,
    iid: instanceId,
    exp,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret());

  return { name: COOKIE, value: token, exp };
}

export async function verifyLicenseSessionCookie(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.trial === true) return false;
    const exp = Number(payload.exp);
    if (exp && exp * 1000 < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

const TRIAL_COOKIE = "nexlify_trial_session";

/** Trial access cookie so middleware can allow the panel during an active trial. */
export async function issueTrialSessionCookie(trialEndsAt: string, instanceId: string) {
  const endSec = Math.floor(new Date(trialEndsAt).getTime() / 1000);
  const maxAge = Math.max(60, endSec - Math.floor(Date.now() / 1000));
  const token = await new SignJWT({
    trial: true,
    iid: instanceId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(endSec)
    .sign(secret());

  return { name: TRIAL_COOKIE, value: token, maxAge };
}

export async function verifyTrialSessionCookie(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.trial !== true) return false;
    const exp = Number(payload.exp);
    if (exp && exp * 1000 < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

export { COOKIE as LICENSE_SESSION_COOKIE, TRIAL_COOKIE as LICENSE_TRIAL_COOKIE };
