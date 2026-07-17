import { NextResponse, type NextRequest } from "next/server";
import { ACCOUNTS, AUTH_COOKIE } from "@/lib/auth";

/**
 * Per-user access gate, behind the AUTH_MODE switch (PRD 09 integration, changes/232).
 *   AUTH_MODE=legacy (DEFAULT):
 *     • Not logged in → /login.
 *     • Employee → may see ONLY their own page (/me) + /api/*; any other route → /me.
 *     • HR / PM → see everything.
 *   AUTH_MODE=shared:
 *     • Cheap presence check on Shlok's shared-session cookie; missing → SHARED_LOGIN_URL (his login),
 *       else the /session explainer. The real RS256 verification + role scoping happen server-side
 *       (lib/session getSession()), so we don't run jwt/JWKS in the edge middleware on every request.
 * /login, /api/login, and static assets are always allowed (via the matcher).
 */
const AUTH_MODE = (process.env.AUTH_MODE ?? "legacy").trim().toLowerCase() === "shared" ? "shared" : "legacy";
const SESSION_COOKIE = process.env.SESSION_COOKIE ?? "tt_access_token";
const SHARED_LOGIN_URL = (process.env.SHARED_LOGIN_URL ?? "").trim();

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // Public, candidate-facing: the branded JD PDF download (linked from the public /apply page).
  if (/^\/api\/jobs\/[^/]+\/jd$/.test(path)) return NextResponse.next();

  if (AUTH_MODE === "shared") {
    if (req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
    if (SHARED_LOGIN_URL) return NextResponse.redirect(new URL(SHARED_LOGIN_URL));
    const url = req.nextUrl.clone();
    url.pathname = "/session"; // reachable (matcher excludes it) — explains the missing shared session
    return NextResponse.redirect(url);
  }

  const username = req.cookies.get(AUTH_COOKIE)?.value;
  const account = username ? ACCOUNTS[username] : undefined;

  if (!account) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (account.role === "employee") {
    const allowed = path === "/me" || path.startsWith("/me/") || path.startsWith("/api/");
    if (!allowed) {
      const url = req.nextUrl.clone();
      url.pathname = "/me";
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  // `session` + `papi` use Shlok's shared JWT session, NOT the legacy hrbot_user cookie — so they're
  // excluded from this matcher (start of retiring my own login, PRD 09 integration). NOTE: keep this to
  // the NEW shared-session routes only — do NOT add `performance`, which is the existing gated
  // Performance & Ranking page under (app) and must stay behind this gate until Phase 3.
  matcher: [
    "/((?!login|api/login|apply|api/apply|session|papi|_next/static|_next/image|favicon.ico|brand|.*\\.svg|.*\\.png).*)",
  ],
};
