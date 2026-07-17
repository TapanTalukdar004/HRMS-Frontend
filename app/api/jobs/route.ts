import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { buildRubric, parseSkills, selectDimensions } from "@/lib/rubric";

/**
 * POST /api/jobs — create a job posting AND freeze its per-job scoring rubric (Phase 1).
 * Behind the app login (middleware gates /api/* except /api/login).
 * Body (JSON): { title (required), level?, department?, employment_type?, openings?, summary?,
 *   salary_min?, salary_max?, currency?, min_experience?, required_skills? (string|string[]),
 *   responsibilities? (string|string[]), is_published? }
 * On create it also inserts job_rubrics version 1 — the frozen rubric every future screening scores against.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  return String(raw || "").split(/[\n;]+/).map((s) => s.trim()).filter(Boolean);
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }

  const title = String(body.title || "").trim().slice(0, 200);
  if (!title) return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });

  const level = (String(body.level || "").trim().slice(0, 60) || null) as string | null;
  const department = (String(body.department || "").trim().slice(0, 80) || null) as string | null;
  const employmentType = (String(body.employment_type || "").trim().slice(0, 60) || null) as string | null;
  const summary = (String(body.summary || "").trim().slice(0, 4000) || null) as string | null;
  const openings = Math.max(1, Math.min(999, parseInt(String(body.openings ?? "1"), 10) || 1));
  const salaryMin = numOrNull(body.salary_min);
  const salaryMax = numOrNull(body.salary_max);
  const currency = (String(body.currency || "").trim().slice(0, 8) || null) as string | null;
  const minExperience = numOrNull(body.min_experience);
  const requiredSkills = parseSkills(body.required_skills as string | string[] | null);
  const responsibilities = toList(body.responsibilities);
  const applyQuestions = toList(body.apply_questions);
  const isPublished = body.is_published === undefined ? true : Boolean(body.is_published);

  // Interview rounds (R4) — optional; empty = single implicit interview. phase_weights splits the overall
  // ledger between screening and the rounds (Δ1). Round weights must total 100.
  const rawRounds = Array.isArray(body.rounds) ? (body.rounds as Record<string, unknown>[]) : [];
  const rounds = rawRounds.map((r, i) => ({
    seq: i + 1,
    name: String(r.name || `Round ${i + 1}`).trim().slice(0, 80),
    round_type: String(r.round_type || "custom").trim().slice(0, 40),
    weight: Math.max(0, Math.min(100, Math.round(Number(r.weight) || 0))),
    focus_prompt: String(r.focus_prompt || "").trim().slice(0, 2000) || null,
  }));
  if (rounds.length && rounds.reduce((n, r) => n + r.weight, 0) !== 100) {
    return NextResponse.json({ ok: false, error: "interview round weights must total 100%" }, { status: 400 });
  }
  const screeningWeight = Math.max(0, Math.min(100, Math.round(Number(body.screening_weight) || 0)));
  const phaseWeights = rounds.length ? { screening: screeningWeight, rounds: 100 - screeningWeight } : null;

  // 1) insert the job
  const jobRows = await q<{ id: string }>(
    `INSERT INTO job_posts (title, level, department, employment_type, openings, summary,
        salary_min, salary_max, currency, min_experience, required_skills, responsibilities,
        is_published, apply_questions, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14::jsonb,'dashboard') RETURNING id`,
    [title, level, department, employmentType, openings, summary, salaryMin, salaryMax, currency,
     minExperience, JSON.stringify(requiredSkills), JSON.stringify(responsibilities), isPublished,
     JSON.stringify(applyQuestions)],
  );
  const id = jobRows[0].id;

  // 2) freeze the rubric (version 1). Field-awareness is INFERRED downstream by the screener/prep from the
  //    job profile (title/skills/responsibilities) — no manual industry/role selection (PRD 14 RC1).
  //    HR-selectable weights (R3) still apply below.
  const base = buildRubric({ level, requiredSkills, minExperience });
  let dimensions = base.dimensions;
  let authoredBy = "level_default";
  const rawDims = Array.isArray(body.dimensions) ? (body.dimensions as { key?: unknown; weight?: unknown }[]) : null;
  const picks = rawDims
    ? rawDims.map((d) => ({ key: String(d.key || ""), weight: Number(d.weight) || 0 })).filter((d) => d.key)
    : null;
  if (picks && picks.length) {
    const sel = selectDimensions(base, picks);
    if (!sel) {
      return NextResponse.json(
        { ok: false, error: "scoring weights must total 100% across the selected criteria" },
        { status: 400 },
      );
    }
    dimensions = sel;
    authoredBy = "hr_selected";
  }
  await q(
    `INSERT INTO job_rubrics (job_post_id, version, level, dimensions, must_haves, authored_by, phase_weights)
     VALUES ($1, 1, $2, $3::jsonb, $4::jsonb, $5, $6::jsonb)`,
    [id, level, JSON.stringify(dimensions), JSON.stringify(base.must_haves), authoredBy,
     phaseWeights ? JSON.stringify(phaseWeights) : null],
  );

  // 3) freeze the interview rounds (if any)
  for (const r of rounds) {
    await q(
      `INSERT INTO job_rounds (job_post_id, seq, name, round_type, weight, focus_prompt)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, r.seq, r.name, r.round_type, r.weight, r.focus_prompt],
    );
  }

  await q(
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail)
     VALUES ('dashboard','job.create','job_post',$1,$2::jsonb)`,
    [id, JSON.stringify({ title, level, openings, is_published: isPublished, rubric_version: 1, band: base.band, authored_by: authoredBy })],
  ).catch(() => {});

  return NextResponse.json({ ok: true, id, rubric_version: 1, band: base.band, authored_by: authoredBy });
}
