import { NextResponse, type NextRequest } from "next/server";

/**
 * Interim access gate for the hosted dashboard.
 *
 * The dashboard exposes employee performance data, so it must not be
 * publicly reachable.  This is a SIMPLE shared-password gate (one
 * password for the whole HR team) — not per-user auth.  Proper login
 * (accounts, roles) is a planned later phase; this keeps the data
 * private in the meantime.
 *
 * How it works:
 *   • /login + /api/login + static assets are always allowed.
 *   • Every other route requires the `hrbot_auth` cookie to equal the
 *     DASHBOARD_AUTH_TOKEN env var.  The login API only sets that cookie
 *     after the visitor enters the correct DASHBOARD_PASSWORD.
 *   • The token lives in an httpOnly cookie (not readable by page JS)
 *     and is a long random secret, so it can't be forged without
 *     knowing the env var.
 *
 * If DASHBOARD_AUTH_TOKEN is unset (e.g. local dev), the gate is OFF so
 * development isn't blocked.  ALWAYS set it in the Vercel project.
 */

const COOKIE = "hrbot_auth";

export function middleware(req: NextRequest) {
  const token = process.env.DASHBOARD_AUTH_TOKEN;
  if (!token) return NextResponse.next();   // gate disabled when unconfigured

  const cookie = req.cookies.get(COOKIE)?.value;
  if (cookie === token) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  // Protect everything EXCEPT the login page, login API, Next internals,
  // and brand/static assets.
  matcher: [
    "/((?!login|api/login|_next/static|_next/image|favicon.ico|brand|.*\\.svg|.*\\.png).*)",
  ],
};
