import { cookies } from "next/headers";
import { accountFor, AUTH_COOKIE } from "@/lib/auth";
import { verifyToken, SESSION_COOKIE } from "@/lib/jwt";

/**
 * Unified session resolver behind the AUTH_MODE switch (PRD 09 integration, changes/232).
 *   AUTH_MODE=legacy (DEFAULT) → the existing hrbot_user cookie + hardcoded ACCOUNTS. Nothing changes.
 *   AUTH_MODE=shared           → Shlok's shared RS256 JWT session (verifyToken). No second login.
 * Both feed one normalized AppSession so pages/layout don't care which mode is active. Default is legacy
 * so the app keeps working until Shlok's JWKS_URL / cookie name / iss / aud land — then flip one env var.
 *
 * Role is the JWT `role` claim in shared mode (source of truth), with `project_manager` as a real third
 * tier; in legacy mode it's the hardcoded account role. Server-side only (reads next/headers cookies).
 */
export type AppRole = "hr" | "employee" | "project_manager";
export type AppSession = {
  userId: string;   // legacy: username · shared: JWT sub (canonical UUID)
  name: string;
  email: string;
  role: AppRole;
  employee?: string; // legacy employee slug (drives /me scoping); shared: resolved via reconciliation later
  team?: string;     // PM's team scope (legacy: Account.team · shared: from Shlok's directory later)
  mode: "legacy" | "shared";
};

export const AUTH_MODE: "legacy" | "shared" =
  (process.env.AUTH_MODE ?? "legacy").trim().toLowerCase() === "shared" ? "shared" : "legacy";

export async function getSession(): Promise<AppSession | null> {
  const jar = await cookies();

  if (AUTH_MODE === "shared") {
    const token = jar.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    try {
      const s = await verifyToken(token);
      const role: AppRole =
        s.role === "hr" ? "hr" : s.role === "project_manager" ? "project_manager" : "employee";
      return { userId: s.sub, name: s.email || s.sub, email: s.email, role, mode: "shared" };
    } catch {
      return null; // present but invalid → treat as no session
    }
  }

  // legacy (default)
  const acct = accountFor(jar.get(AUTH_COOKIE)?.value);
  if (!acct) return null;
  return {
    userId: acct.username,
    name: acct.label,
    email: "",
    // A PM-tagged account surfaces as the REAL project_manager role (changes/235) — same value Shlok's
    // JWT will carry — while its legacy access level stays "hr" (see lib/auth.ts).
    role: acct.kind === "pm" ? "project_manager" : acct.role,
    employee: acct.employee,
    team: acct.team,
    mode: "legacy",
  };
}

/** Sidebar only distinguishes hr vs employee; project_manager gets HR-level visibility (sees everyone). */
export function sidebarRole(role: AppRole | undefined): "hr" | "employee" | undefined {
  if (!role) return undefined;
  return role === "employee" ? "employee" : "hr";
}
