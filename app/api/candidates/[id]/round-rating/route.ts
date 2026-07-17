import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { q } from "@/lib/db";
import { accountFor, AUTH_COOKIE } from "@/lib/auth";

/**
 * POST /api/candidates/[id]/round-rating — HR-only. Save the interviewer's rating for ONE interview round
 * (PRD 14 R6). Proof-first: a counted competency needs a 1–4 rating AND an evidence quote. round_score =
 * assessed 1–4 avg → 0..100. When ALL of the job's rounds are rated, moves stage → 'interviewed'.
 * Ranking-only / advisory: never advances/rejects/offers — a human clicks those. No auto-reject.
 * Body: { round_seq, competencies:[{key,label,rating,evidence,not_assessed}], verdict, notes? }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANCHORS: Record<number, string> = {
  1: "1 · no evidence / red flag", 2: "2 · some evidence, real gaps",
  3: "3 · solid, clears the bar", 4: "4 · strong, clearly exceeds",
};
const VERDICTS = new Set(["strong_no", "no", "yes", "strong_yes"]);
type InComp = { key?: string; label?: string; rating?: unknown; evidence?: unknown; not_assessed?: unknown };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const acct = accountFor((await cookies()).get(AUTH_COOKIE)?.value);
  if (!acct) return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });
  if (acct.role !== "hr") return NextResponse.json({ ok: false, error: "HR only" }, { status: 403 });

  const { id } = await ctx.params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }

  const roundSeq = parseInt(String(body.round_seq), 10);
  if (!Number.isInteger(roundSeq)) return NextResponse.json({ ok: false, error: "round_seq required" }, { status: 400 });
  const raw = Array.isArray(body.competencies) ? (body.competencies as InComp[]) : [];
  if (raw.length === 0) return NextResponse.json({ ok: false, error: "no competencies submitted" }, { status: 400 });
  const verdict = String(body.verdict || "");
  if (!VERDICTS.has(verdict)) return NextResponse.json({ ok: false, error: "verdict required (strong_no|no|yes|strong_yes)" }, { status: 400 });
  const notes = String(body.notes || "").slice(0, 4000);

  const comps: { key: string; label: string; rating: number | null; anchor_label: string | null; evidence: string; not_assessed: boolean }[] = [];
  let sum = 0, assessed = 0;
  for (const c0 of raw) {
    const key = String(c0.key || "").slice(0, 60);
    const label = String(c0.label || key).slice(0, 200);
    const evidence = String(c0.evidence || "").trim().slice(0, 2000);
    if (c0.not_assessed === true) { comps.push({ key, label, rating: null, anchor_label: null, evidence, not_assessed: true }); continue; }
    const rating = Number(c0.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 4) return NextResponse.json({ ok: false, error: `"${label}" needs a rating of 1–4 (or mark it not assessed)` }, { status: 400 });
    if (!evidence) return NextResponse.json({ ok: false, error: `"${label}" needs an evidence quote` }, { status: 400 });
    comps.push({ key, label, rating, anchor_label: ANCHORS[rating], evidence, not_assessed: false });
    sum += rating; assessed++;
  }
  if (assessed === 0) return NextResponse.json({ ok: false, error: "score at least one competency" }, { status: 400 });
  const roundScore = Math.round((sum / assessed) / 4 * 100);

  let cand: { job_post_id: string; stage: string } | undefined;
  try {
    cand = (await q<{ job_post_id: string; stage: string }>("SELECT job_post_id, stage FROM candidates WHERE id = $1::uuid", [id]))[0];
  } catch { return NextResponse.json({ ok: false, error: "invalid candidate id" }, { status: 400 }); }
  if (!cand) return NextResponse.json({ ok: false, error: "candidate not found" }, { status: 404 });

  const round = (await q<{ seq: number }>("SELECT seq FROM job_rounds WHERE job_post_id = $1 AND seq = $2", [cand.job_post_id, roundSeq]))[0];
  if (!round) return NextResponse.json({ ok: false, error: "that round does not exist for this job" }, { status: 400 });

  await q(
    `INSERT INTO interview_round_ratings (candidate_id, round_seq, job_post_id, competency_scores, round_score_0_100, verdict, notes, rated_by, rated_at)
     VALUES ($1::uuid,$2,$3,$4::jsonb,$5,$6,$7,$8, now())
     ON CONFLICT (candidate_id, round_seq) DO UPDATE SET
       competency_scores = EXCLUDED.competency_scores, round_score_0_100 = EXCLUDED.round_score_0_100,
       verdict = EXCLUDED.verdict, notes = EXCLUDED.notes, rated_by = EXCLUDED.rated_by, rated_at = now()`,
    [id, roundSeq, cand.job_post_id, JSON.stringify(comps), roundScore, verdict, notes, acct.username],
  );

  // When every configured round is rated, advance the stage to 'interviewed' (never downgrade/reject).
  const total = (await q<{ n: number }>("SELECT count(*)::int AS n FROM job_rounds WHERE job_post_id = $1", [cand.job_post_id]))[0]?.n ?? 0;
  const rated = (await q<{ n: number }>("SELECT count(*)::int AS n FROM interview_round_ratings WHERE candidate_id = $1::uuid", [id]))[0]?.n ?? 0;
  let stage = cand.stage;
  if (total > 0 && rated >= total && (cand.stage === "shortlisted" || cand.stage === "screened")) {
    await q("UPDATE candidates SET stage='interviewed' WHERE id = $1::uuid AND stage IN ('shortlisted','screened')", [id]);
    stage = "interviewed";
  }

  await q(
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail)
     VALUES ($1,'interview.round_rated','candidate',$2,$3::jsonb)`,
    [acct.username, id, JSON.stringify({ job_post_id: cand.job_post_id, round_seq: roundSeq, round_score: roundScore, verdict, rated, total, by: acct.label })],
  ).catch(() => {});

  return NextResponse.json({ ok: true, id, round_seq: roundSeq, round_score: roundScore, verdict, stage, rated, total });
}
