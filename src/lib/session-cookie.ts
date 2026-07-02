import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

/** HTTP / IP panels must not use Secure cookies or browsers drop the session. */
export function panelSessionCookieSecure(req?: NextRequest): boolean {
  if (process.env.PANEL_COOKIE_SECURE === "0") return false;
  if (process.env.NEXLIFY_LICENSE_COOKIE_SECURE === "0") return false;
  if (req) {
    const forwarded = req.headers.get("x-forwarded-proto");
    if (forwarded) {
      return forwarded.split(",")[0]?.trim() === "https";
    }
    return req.nextUrl.protocol === "https:";
  }
  return process.env.PANEL_COOKIE_SECURE === "1";
}

export type SessionCookieParams = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
};

export function panelSessionCookieOptions(
  req: NextRequest | undefined,
  maxAgeDays: number
): SessionCookieParams {
  const maxDays = Number.isFinite(maxAgeDays) && maxAgeDays > 0 ? maxAgeDays : 7;
  return {
    httpOnly: true,
    secure: panelSessionCookieSecure(req),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * maxDays,
  };
}

export function setPanelSessionOnResponse(
  res: NextResponse,
  token: string,
  req: NextRequest | undefined,
  maxAgeDays: number
) {
  res.cookies.set("nexlify_session", token, panelSessionCookieOptions(req, maxAgeDays));
}
