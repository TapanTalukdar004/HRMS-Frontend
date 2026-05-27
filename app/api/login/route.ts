import { NextResponse } from "next/server";

/**
 * Verifies the shared dashboard password and, on success, sets the
 * httpOnly auth cookie that middleware.ts checks.
 *
 * Env vars (set in Vercel):
 *   DASHBOARD_PASSWORD     — what HR types on the login page
 *   DASHBOARD_AUTH_TOKEN   — long random secret; the cookie value
 */
export async function POST(req: Request) {
  let password = "";
  try {
    const body = await req.json();
    password = String(body?.password ?? "");
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const expected = process.env.DASHBOARD_PASSWORD;
  const token = process.env.DASHBOARD_AUTH_TOKEN;
  if (!expected || !token) {
    return NextResponse.json(
      { error: "auth not configured on server" },
      { status: 500 },
    );
  }

  // Constant-ish comparison (length check + equality). Good enough for a
  // shared-password gate; not a high-value secret.
  if (password.length !== expected.length || password !== expected) {
    return NextResponse.json({ error: "incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}

const COOKIE = "hrbot_auth";
