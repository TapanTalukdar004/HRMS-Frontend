import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { q } from "@/lib/db";
import { accountFor, AUTH_COOKIE } from "@/lib/auth";

/**
 * PATCH /api/employees/[id] — HR edits an existing employee (details + identity fields). Updates the
 * `employees` master + upserts `employee_profiles` + re-upserts `github_identities`. HR-only, audit-logged.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const s = (v: unknown, n = 200) => (String(v ?? "").trim().slice(0, n) || null);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const acct = accountFor((await cookies()).get(AUTH_COOKIE)?.value);
  if (!acct) return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });
  if (acct.role !== "hr") return NextResponse.json({ ok: false, error: "HR only" }, { status: 403 });

  const { id } = await ctx.params;
  const exists = (await q<{ id: string }>("SELECT id FROM employees WHERE id = $1", [id]))[0];
  if (!exists) return NextResponse.json({ ok: false, error: "employee not found" }, { status: 404 });

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }
  const name = s(b.name);
  if (!name) return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });

  const email = b.email ? String(b.email).trim().toLowerCase().slice(0, 200) : null;
  const githubLogin = s(b.github_login, 80);
  const linearEmail = b.linear_email ? String(b.linear_email).trim().toLowerCase().slice(0, 200) : null;
  const isActive = b.is_active === undefined ? true : Boolean(b.is_active);

  try {
    await q(
      `UPDATE employees SET name = $2, first_name = $3, email = $4, role = $5, manager_email = $6, is_active = $7
       WHERE id = $1`,
      [id, name, name.split(/\s+/)[0] || name, email, s(b.role, 80),
       b.manager_email ? String(b.manager_email).trim().toLowerCase() : null, isActive],
    );
    await q(
      `INSERT INTO employee_profiles (id, employee_id, emp_id, designation, department, joining_date, location, pronoun,
         github_login, linear_email, linear_user_id, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11, now())
       ON CONFLICT (employee_id) DO UPDATE SET
         emp_id = EXCLUDED.emp_id, designation = EXCLUDED.designation, department = EXCLUDED.department,
         joining_date = EXCLUDED.joining_date, location = EXCLUDED.location, pronoun = EXCLUDED.pronoun,
         github_login = EXCLUDED.github_login, linear_email = EXCLUDED.linear_email,
         linear_user_id = EXCLUDED.linear_user_id, updated_at = now()`,
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
       VALUES ($1,'employee.update','employee',$2,$3::jsonb)`,
      [acct.username, id, JSON.stringify({ name, github_login: githubLogin, linear_email: linearEmail, by: acct.label })],
    ).catch(() => {});
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id, name });
}
