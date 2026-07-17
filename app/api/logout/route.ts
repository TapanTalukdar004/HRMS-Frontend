import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";

/** Clears the auth cookie so the user is signed out (back to /login). */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
