import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { q } from "@/lib/db";
import { accountFor, AUTH_COOKIE } from "@/lib/auth";

/**
 * POST /api/candidates/[id]/interview — create/ensure the interview session + record the interview-time
 * recording-consent snapshot (Phase 4a). Behind login AND HR-only. Called by the cockpit when the
 * interviewer ticks consent and starts recording; getUserMedia stays client-blocked until this returns ok.
 * Body: { consent_recording: boolean, notice_version?: string, competencies?: [{key,label,guide,focus}] }
 * Idempotent (upsert on candidate_id). Never advances/rejects — advisory pipeline only.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await cookies();
  const acct = accountFor(c.get(AUTH_COOKIE)?.value);
  if (!acct) return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });
  if (acct.role !== "hr") return NextResponse.json({ ok: false, error: "HR only" }, { status: 403 });

  const { id } = await ctx.params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* */ }
  const consent = Boolean(body.consent_recording);
  if (!consent) return NextResponse.json({ ok: false, error: "recording consent is required" }, { status: 400 });
  const noticeVersion = String(body.notice_version || "v1").slice(0, 40);
  const competencies = Array.isArray(body.competencies) ? body.competencies : [];

  let cand: { id: string; job_post_id: string; name: string } | undefined;
  try {
    cand = (await q<{ id: string; job_post_id: string; name: string }>(
      "SELECT id, job_post_id, name FROM candidates WHERE id = $1::uuid", [id],
    ))[0];
  } catch { return NextResponse.json({ ok: false, error: "invalid candidate id" }, { status: 400 }); }
  if (!cand) return NextResponse.json({ ok: false, error: "candidate not found" }, { status: 404 });

  const rv = (await q<{ version: number }>(
    "SELECT version FROM job_rubrics WHERE job_post_id = $1 ORDER BY version DESC LIMIT 1", [cand.job_post_id],
  ))[0]?.version ?? null;

  await q(
    `INSERT INTO interviews (candidate_id, job_post_id, rubric_version, interviewer, status,
        competencies, consent_recording, consent_at, consent_notice_version, updated_at)
     VALUES ($1::uuid,$2,$3,$4,'created',$5::jsonb,true, now(), $6, now())
     ON CONFLICT (candidate_id) DO UPDATE SET
        consent_recording = true, consent_at = now(), consent_notice_version = EXCLUDED.consent_notice_version,
        competencies = CASE WHEN jsonb_array_length(EXCLUDED.competencies) > 0
                            THEN EXCLUDED.competencies ELSE interviews.competencies END,
        rubric_version = EXCLUDED.rubric_version, updated_at = now()`,
    [id, cand.job_post_id, rv, acct.username, JSON.stringify(competencies), noticeVersion],
  );

  await q(
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail)
     VALUES ($1,'interview.consent_recorded','candidate',$2,$3::jsonb)`,
    [acct.username, id, JSON.stringify({ job_post_id: cand.job_post_id, notice_version: noticeVersion, by: acct.label })],
  ).catch(() => {});

  return NextResponse.json({ ok: true, id, rubric_version: rv });
}
