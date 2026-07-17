import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import path from "node:path";
import { q } from "@/lib/db";
import { accountFor, AUTH_COOKIE } from "@/lib/auth";
import { repoRoot, spawnPythonDetached, enqueueScreeningRequest } from "@/lib/pyRun";

/**
 * POST /api/jobs/[jobId]/screen — HR-only. Kicks off the Resume Screener for the whole job in the
 * BACKGROUND (fire-and-forget); the content-hash cache skips already-screened resumes, so this screens
 * the unscreened ones. Advisory only — it produces scores and moves applied→screened; it never
 * shortlists/rejects. Returns immediately with the unscreened count; scores appear as they finish.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const acct = accountFor((await cookies()).get(AUTH_COOKIE)?.value);
  if (!acct) return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });
  if (acct.role !== "hr") return NextResponse.json({ ok: false, error: "HR only" }, { status: 403 });

  const { jobId } = await ctx.params;
  let unscreened = 0;
  try {
    const rows = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM candidates c
        WHERE c.job_post_id = $1::uuid
          AND NOT EXISTS (SELECT 1 FROM screenings s WHERE s.candidate_id = c.id)`,
      [jobId],
    );
    unscreened = rows[0]?.n ?? 0;
  } catch { return NextResponse.json({ ok: false, error: "invalid job id" }, { status: 400 }); }

  // Mark the unscreened as 'pending' up front, so a hard crash before the screener records per-candidate
  // status still leaves a visible state (not a silent "applied"). The screener flips these to
  // processing→done/failed as it runs.
  await q(
    `UPDATE candidates SET screen_status='pending' WHERE job_post_id = $1::uuid
       AND NOT EXISTS (SELECT 1 FROM screenings s WHERE s.candidate_id = candidates.id)`,
    [jobId],
  ).catch(() => {});

  // Locally / on a host with the venv, spawn the screener directly. On Vercel (no venv), queue it for
  // the local poller (perf_tracker/screening_worker.py) instead — see lib/pyRun.ts.
  const root = repoRoot();
  const started = root
    ? spawnPythonDetached([path.join(root, "agent", "resume_screener.py"), "--job", jobId], root)
    : await enqueueScreeningRequest(jobId, null, `hr:${acct.username}`);
  if (!started) {
    return NextResponse.json(
      { ok: false, error: root ? "could not start the screener" : "could not queue the screening request" },
      { status: 502 },
    );
  }

  await q(
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail)
     VALUES ($1,'job.screen_all','job_post',$2,$3::jsonb)`,
    [acct.username, jobId, JSON.stringify({ unscreened, by: acct.label })],
  ).catch(() => {});

  return NextResponse.json({ ok: true, unscreened, message: "screening started" });
}
