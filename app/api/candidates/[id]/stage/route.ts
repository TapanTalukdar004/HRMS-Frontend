import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import path from "node:path";
import { q } from "@/lib/db";
import { accountFor, AUTH_COOKIE } from "@/lib/auth";
import { repoRoot, spawnPythonDetached } from "@/lib/pyRun";

/**
 * POST /api/candidates/[id]/stage — the HUMAN shortlist decision (Phase 3).
 * Behind the app login AND HR-only. The screening agent only *recommends*; ADVANCING or REJECTING a
 * candidate is always a human click that lands here — the algorithm never sets these states itself.
 * Body: { action: "shortlist" | "reject" | "reset" }
 *   shortlist → candidates.stage='shortlisted', screenings.shortlisted=true
 *   reject    → candidates.stage='rejected',    screenings.shortlisted=false
 *   reset     → back to 'screened' (or 'applied' if never screened), screenings.shortlisted=false
 * Every change is written to audit_log with the acting HR user.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAP: Record<string, { stage: string; shortlisted: boolean; action: string }> = {
  shortlist: { stage: "shortlisted", shortlisted: true, action: "candidate.shortlist" },
  reject: { stage: "rejected", shortlisted: false, action: "candidate.reject" },
  reset: { stage: "screened", shortlisted: false, action: "candidate.reset" },
  offer: { stage: "offer", shortlisted: true, action: "candidate.offer" },
  hire: { stage: "hired", shortlisted: true, action: "candidate.hire" },
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await cookies();
  const acct = accountFor(c.get(AUTH_COOKIE)?.value);
  if (!acct) return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });
  if (acct.role !== "hr") return NextResponse.json({ ok: false, error: "only HR can change a candidate's stage" }, { status: 403 });

  const { id } = await ctx.params;
  let action = "";
  try { const b = await req.json(); action = String(b?.action || "").trim(); } catch { /* */ }
  const m = MAP[action];
  if (!m) return NextResponse.json({ ok: false, error: "action must be shortlist | reject | reset" }, { status: 400 });

  // load the candidate (and whether it was ever screened, for a correct 'reset')
  let cand: { id: string; job_post_id: string; name: string; stage: string; scored: boolean } | undefined;
  try {
    cand = (await q<{ id: string; job_post_id: string; name: string; stage: string; scored: boolean }>(
      `SELECT c.id, c.job_post_id, c.name, c.stage,
              EXISTS(SELECT 1 FROM screenings s WHERE s.candidate_id = c.id) AS scored
         FROM candidates c WHERE c.id = $1::uuid`,
      [id],
    ))[0];
  } catch { return NextResponse.json({ ok: false, error: "invalid candidate id" }, { status: 400 }); }
  if (!cand) return NextResponse.json({ ok: false, error: "candidate not found" }, { status: 404 });

  const newStage = action === "reset" ? (cand.scored ? "screened" : "applied") : m.stage;
  const fromStage = cand.stage;

  await q("UPDATE candidates SET stage = $2 WHERE id = $1::uuid", [id, newStage]);
  // reflect on the screening row (no-op if the candidate was never screened)
  await q("UPDATE screenings SET shortlisted = $2 WHERE candidate_id = $1::uuid", [id, m.shortlisted]);
  await q(
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail)
     VALUES ($1, $2, 'candidate', $3, $4::jsonb)`,
    [acct.username, m.action, id, JSON.stringify({ from: fromStage, to: newStage, job_post_id: cand.job_post_id, by: acct.label })],
  ).catch(() => {});

  // Auto-generate the interview prep sheet in the BACKGROUND the moment a candidate is shortlisted
  // (HR view — no CLI). Best-effort, non-blocking; the sheet appears on their profile when ready.
  if (action === "shortlist") {
    // Pre-mark pending so a prep failure/no-op is visible (not a silent gap). interview_prep.py flips this
    // to processing→done/failed and self-records prep_error (PRD 14 RC4).
    await q("UPDATE candidates SET prep_status='pending', prep_error=NULL WHERE id = $1::uuid", [id]).catch(() => {});
    try {
      const root = repoRoot();
      if (root) spawnPythonDetached([path.join(root, "agent", "interview_prep.py"), "--job", cand.job_post_id, "--candidate", id], root);
    } catch { /* never let prep generation affect the shortlist response */ }
  }

  return NextResponse.json({ ok: true, id, stage: newStage, shortlisted: m.shortlisted });
}
