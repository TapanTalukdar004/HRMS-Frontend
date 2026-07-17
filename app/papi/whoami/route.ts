import { NextResponse } from "next/server";
import { verifyToken, tokenFromRequest } from "@/lib/jwt";

/**
 * GET /papi/whoami — verify the shared RUH HRMS JWT and echo the caller (PRD 09 integration, Path B).
 * No session table: the verified token IS the identity. Returns { sub, role, email } or 401.
 * Outside the legacy hrbot_user middleware gate (see middleware.ts matcher).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = tokenFromRequest(req);
  if (!token) return NextResponse.json({ ok: false, error: "no shared-session token" }, { status: 401 });
  try {
    const s = await verifyToken(token);
    return NextResponse.json({ ok: true, sub: s.sub, role: s.role, email: s.email });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `invalid token: ${(e as Error).message}` }, { status: 401 });
  }
}
