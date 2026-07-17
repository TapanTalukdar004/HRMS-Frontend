import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import path from "node:path";
import { q } from "@/lib/db";
import { accountFor, AUTH_COOKIE } from "@/lib/auth";
import { repoRoot, spawnPythonDetached } from "@/lib/pyRun";

/**
 * POST /api/candidates/[id]/prep — HR-only. (Re)generate the interview prep sheet for a SHORTLISTED
 * candidate. Advisory only — prep is a preparation aid, never a gate. interview_prep.py self-records
 * candidates.prep_status/prep_error, so a failure is visible + retryable here (never the old silent gap
 * that lost Supreeti's prep). `--force` regenerates even if a sheet already exists.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const acct = accountFor((await cookies()).get(AUTH_COOKIE)?.value);
  if (!acct) return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });
  if (acct.role !== "hr") return NextResponse.json({ ok: false, error: "HR only" }, { status: 403 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* no body = generate the next un-prepped round */ }
  const roundSeq = Number.isInteger(Number(body.round_seq)) ? Number(body.round_seq) : null;
  const force = body.force === true;

  const { id } = await ctx.params;
  let cand: { id: string; job_post_id: string; stage: string } | undefined;
  try {
    cand = (await q<{ id: string; job_post_id: string; stage: string }>(
      "SELECT id, job_post_id, stage FROM candidates WHERE id = $1::uuid",
      [id],
    ))[0];
  } catch { return NextResponse.json({ ok: false, error: "invalid candidate id" }, { status: 400 }); }
  if (!cand) return NextResponse.json({ ok: false, error: "candidate not found" }, { status: 404 });
  if (cand.stage !== "shortlisted" && cand.stage !== "interviewed") {
    return NextResponse.json({ ok: false, error: "prep is generated once a candidate is shortlisted" }, { status: 409 });
  }

  await q("UPDATE candidates SET prep_status='pending', prep_error=NULL WHERE id = $1::uuid", [id]).catch(() => {});

  const root = repoRoot();
  const pyArgs = [path.join(root ?? "", "agent", "interview_prep.py"), "--job", cand.job_post_id, "--candidate", id];
  if (roundSeq != null) pyArgs.push("--round", String(roundSeq));
  if (force) pyArgs.push("--force");
  const started = root ? spawnPythonDetached(pyArgs, root) : false;
  if (!started) {
    await q(
      "UPDATE candidates SET prep_status='failed', prep_error='could not start prep generator (no local runtime)' WHERE id = $1::uuid",
      [id],
    ).catch(() => {});
    return NextResponse.json({ ok: false, error: "could not start the prep generator" }, { status: 502 });
  }

  await q(
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail)
     VALUES ($1,'candidate.prep','candidate',$2,$3::jsonb)`,
    [acct.username, id, JSON.stringify({ job_post_id: cand.job_post_id, by: acct.label })],
  ).catch(() => {});

  return NextResponse.json({ ok: true, id, message: "prep generation started" });
}
