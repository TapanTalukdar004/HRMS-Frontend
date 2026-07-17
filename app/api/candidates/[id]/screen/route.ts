import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import path from "node:path";
import { q } from "@/lib/db";
import { accountFor, AUTH_COOKIE } from "@/lib/auth";
import { repoRoot, spawnPythonDetached, enqueueScreeningRequest } from "@/lib/pyRun";

/**
 * POST /api/candidates/[id]/screen — HR-only. Screen (or RETRY screening for) a SINGLE candidate.
 * Advisory only: it produces the score and moves applied→screened; it never shortlists/rejects.
 * The screener self-records candidates.screen_status/screen_error durably, so a failure is visible +
 * retryable (never the old silent "applied"). `--force` re-runs even if a cached result exists.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const acct = accountFor((await cookies()).get(AUTH_COOKIE)?.value);
  if (!acct) return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });
  if (acct.role !== "hr") return NextResponse.json({ ok: false, error: "HR only" }, { status: 403 });

  const { id } = await ctx.params;
  let cand: { id: string; job_post_id: string } | undefined;
  try {
    cand = (await q<{ id: string; job_post_id: string }>(
      "SELECT id, job_post_id FROM candidates WHERE id = $1::uuid",
      [id],
    ))[0];
  } catch { return NextResponse.json({ ok: false, error: "invalid candidate id" }, { status: 400 }); }
  if (!cand) return NextResponse.json({ ok: false, error: "candidate not found" }, { status: 404 });

  // Show it as queued immediately (the screener flips this to processing→done/failed).
  await q("UPDATE candidates SET screen_status='pending', screen_error=NULL WHERE id = $1::uuid", [id]).catch(() => {});

  // Locally / on a host with the venv, spawn directly; on Vercel (no venv), queue for the local poller.
  const root = repoRoot();
  const started = root
    ? spawnPythonDetached(
        [path.join(root, "agent", "resume_screener.py"), "--job", cand.job_post_id, "--candidate", id, "--force"],
        root,
      )
    : await enqueueScreeningRequest(cand.job_post_id, id, `hr:${acct.username}`);
  if (!started) {
    await q(
      "UPDATE candidates SET screen_status='failed', screen_error='could not start screener' WHERE id = $1::uuid",
      [id],
    ).catch(() => {});
    return NextResponse.json(
      { ok: false, error: root ? "could not start the screener" : "could not queue the screening request" },
      { status: 502 },
    );
  }

  await q(
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail)
     VALUES ($1,'candidate.screen','candidate',$2,$3::jsonb)`,
    [acct.username, id, JSON.stringify({ job_post_id: cand.job_post_id, by: acct.label })],
  ).catch(() => {});

  return NextResponse.json({ ok: true, id, message: "screening started" });
}
