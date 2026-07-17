import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { q } from "@/lib/db";
import { accountFor, AUTH_COOKIE } from "@/lib/auth";

/**
 * POST /api/candidates/[id]/interview/rating — save + LOCK the human interviewer's per-competency rating
 * (Phase 4a). Behind login AND HR-only. This is the anti-anchoring gate: the human commits their scores
 * here FIRST; the AI report (Phase 4b) is only ever generated/revealed after this row exists, and
 * human_rated_at must predate it. PROOF-FIRST: a counted competency needs a rating in 1..4 AND non-empty
 * evidence. Computes human_overall (assessed 1-4 avg → 0..100). Does NOT touch candidates.stage (advisory).
 * Body: { competencies:[{key,label,rating,evidence,not_assessed}], overall_recommendation, notes? }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANCHORS: Record<number, string> = {
  1: "1 · no evidence / red flag",
  2: "2 · some evidence, real gaps",
  3: "3 · solid, clears the bar",
  4: "4 · strong, clearly exceeds",
};
const OVERALL = new Set(["strong_no", "no", "yes", "strong_yes"]);

type InComp = { key?: string; label?: string; rating?: unknown; evidence?: unknown; not_assessed?: unknown };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await cookies();
  const acct = accountFor(c.get(AUTH_COOKIE)?.value);
  if (!acct) return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });
  if (acct.role !== "hr") return NextResponse.json({ ok: false, error: "HR only" }, { status: 403 });

  const { id } = await ctx.params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }

  const raw = Array.isArray(body.competencies) ? (body.competencies as InComp[]) : [];
  if (raw.length === 0) return NextResponse.json({ ok: false, error: "no competencies submitted" }, { status: 400 });
  const overall = String(body.overall_recommendation || "");
  if (!OVERALL.has(overall)) return NextResponse.json({ ok: false, error: "overall_recommendation required (strong_no|no|yes|strong_yes)" }, { status: 400 });
  const notes = String(body.notes || "").slice(0, 4000);

  // validate + normalise
  const comps: { key: string; label: string; rating: number | null; anchor_label: string | null; evidence: string; not_assessed: boolean }[] = [];
  let sum = 0, assessed = 0;
  for (const c0 of raw) {
    const key = String(c0.key || "").slice(0, 60);
    const label = String(c0.label || key).slice(0, 200);
    const notAssessed = c0.not_assessed === true;
    const evidence = String(c0.evidence || "").trim().slice(0, 2000);
    if (notAssessed) {
      comps.push({ key, label, rating: null, anchor_label: null, evidence, not_assessed: true });
      continue;
    }
    const rating = Number(c0.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 4) {
      return NextResponse.json({ ok: false, error: `"${label}" needs a rating of 1–4 (or mark it not assessed)` }, { status: 400 });
    }
    if (!evidence) {
      return NextResponse.json({ ok: false, error: `"${label}" needs an evidence quote — a rating without a quote is an opinion, not a decision` }, { status: 400 });
    }
    comps.push({ key, label, rating, anchor_label: ANCHORS[rating], evidence, not_assessed: false });
    sum += rating; assessed++;
  }
  if (assessed === 0) return NextResponse.json({ ok: false, error: "score at least one competency" }, { status: 400 });
  const humanOverall = Math.round((sum / assessed) / 4 * 100);

  let cand: { job_post_id: string } | undefined;
  try {
    cand = (await q<{ job_post_id: string }>("SELECT job_post_id FROM candidates WHERE id = $1::uuid", [id]))[0];
  } catch { return NextResponse.json({ ok: false, error: "invalid candidate id" }, { status: 400 }); }
  if (!cand) return NextResponse.json({ ok: false, error: "candidate not found" }, { status: 404 });
  const rv = (await q<{ version: number }>(
    "SELECT version FROM job_rubrics WHERE job_post_id = $1 ORDER BY version DESC LIMIT 1", [cand.job_post_id],
  ))[0]?.version ?? null;

  // ensure a parent interview row exists (idempotent), then lock the rating
  await q(
    `INSERT INTO interviews (candidate_id, job_post_id, rubric_version, interviewer, status, updated_at)
     VALUES ($1::uuid,$2,$3,$4,'human_rated', now())
     ON CONFLICT (candidate_id) DO UPDATE SET status = 'human_rated', updated_at = now()`,
    [id, cand.job_post_id, rv, acct.username],
  );
  await q(
    `INSERT INTO interview_human_ratings (candidate_id, job_post_id, rubric_version, competencies,
        overall_recommendation, human_overall, notes, human_rated_at)
     VALUES ($1::uuid,$2,$3,$4::jsonb,$5,$6,$7, now())
     ON CONFLICT (candidate_id) DO UPDATE SET
        rubric_version = EXCLUDED.rubric_version, competencies = EXCLUDED.competencies,
        overall_recommendation = EXCLUDED.overall_recommendation, human_overall = EXCLUDED.human_overall,
        notes = EXCLUDED.notes, human_rated_at = now()`,
    [id, cand.job_post_id, rv, JSON.stringify(comps), overall, humanOverall, notes],
  );
  await q(
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail)
     VALUES ($1,'interview.human_rated','candidate',$2,$3::jsonb)`,
    [acct.username, id, JSON.stringify({ job_post_id: cand.job_post_id, human_overall: humanOverall, overall_recommendation: overall, assessed, by: acct.label })],
  ).catch(() => {});

  return NextResponse.json({ ok: true, id, human_overall: humanOverall, overall_recommendation: overall });
}
