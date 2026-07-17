import { NextResponse } from "next/server";
import { ACCOUNTS, SIMPLE_PASSWORD, AUTH_COOKIE } from "@/lib/auth";

/**
 * Per-user login. Verifies username + the shared simple password (pass123 for now)
 * and sets an httpOnly cookie with the username. middleware.ts enforces role access.
 */
export async function POST(req: Request) {
  let username = "", password = "";
  try {
    const body = await req.json();
    username = String(body?.username ?? "").trim().toLowerCase();
    password = String(body?.password ?? "");
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const account = ACCOUNTS[username];
  if (!account || password !== SIMPLE_PASSWORD) {
    return NextResponse.json({ error: "incorrect username or password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, role: account.role });
  res.cookies.set(AUTH_COOKIE, username, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
