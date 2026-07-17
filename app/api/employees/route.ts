import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { q } from "@/lib/db";
import { accountFor, AUTH_COOKIE } from "@/lib/auth";

/**
 * POST /api/employees — HR adds a new employee (the identity hub, PRD/08 locked decision). Writes the
 * `employees` master + `employee_profiles` (incl. github_login / linear_email / linear_user_id) and upserts
 * `github_identities` so PR authorship can later resolve to this person. HR-only, audit-logged. No scores.
 * Body: { name*, email?, role?, manager_email?, is_active?, emp_id?, designation?, department?, joining_date?,
 *         location?, pronoun?, github_login?, linear_email?, linear_user_id? }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const s = (v: unknown, n = 200) => (String(v ?? "").trim().slice(0, n) || null);

export async function POST(req: Request) {
  const acct = accountFor((await cookies()).get(AUTH_COOKIE)?.value);
  if (!acct) return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });
  if (acct.role !== "hr") return NextResponse.json({ ok: false, error: "HR only" }, { status: 403 });

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }
  const name = s(b.name);
  if (!name) return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });

  const email = b.email ? String(b.email).trim().toLowerCase().slice(0, 200) : null;
  const githubLogin = s(b.github_login, 80);
  const linearEmail = b.linear_email ? String(b.linear_email).trim().toLowerCase().slice(0, 200) : null;
  const firstName = name.split(/\s+/)[0] || name;
  const id = randomUUID();
  const slackId = "manual:" + id; // employees.slack_user_id is NOT NULL UNIQUE; synthesize for HR-entered rows
  const isActive = b.is_active === undefined ? true : Boolean(b.is_active);

  try {
    await q(
      `INSERT INTO employees (id, slack_user_id, name, first_name, email, role, manager_email, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, slackId, name, firstName, email, s(b.role, 80), b.manager_email ? String(b.manager_email).trim().toLowerCase() : null, isActive],
    );
    await q(
      `INSERT INTO employee_profiles (id, employee_id, emp_id, designation, department, joining_date, location, pronoun,
         github_login, linear_email, linear_user_id, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11, now())`,
      [randomUUID(), id, s(b.emp_id, 64), s(b.designation), s(b.department), s(b.joining_date, 10), s(b.location),
       s(b.pronoun, 16), githubLogin, linearEmail, s(b.linear_user_id, 80)],
    );
    if (githubLogin) {
      await q(
        `INSERT INTO github_identities (github_login, employee_id, employee_name, match_method, verified_at)
         VALUES ($1,$2,$3,'manual', now())
         ON CONFLICT (github_login) DO UPDATE SET employee_id = EXCLUDED.employee_id,
           employee_name = EXCLUDED.employee_name, match_method = 'manual', verified_at = now()`,
        [githubLogin, id, name],
      );
    }
    await q(
      `INSERT INTO audit_log (actor, action, entity, entity_id, detail)
       VALUES ($1,'employee.create','employee',$2,$3::jsonb)`,
      [acct.username, id, JSON.stringify({ name, github_login: githubLogin, linear_email: linearEmail, by: acct.label })],
    ).catch(() => {});
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id, name });
}
