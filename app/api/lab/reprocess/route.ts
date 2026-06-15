import { NextResponse } from "next/server";
import { q } from "@/lib/db";

/**
 * POST /api/lab/reprocess
 * Body: { issue_key }
 *
 * Admin "re-process this issue" control for the Agent Lab. Sets
 * reprocess_requested = TRUE on the most-recent agent_assessments row for the
 * issue_key in the practice repo. On the next agent run, run_agent.py treats a
 * flagged row as needing a re-judge even when the code (head_sha) did not
 * change, then clears the flag after a successful upsert.
 *
 * Scoped to the practice repo only — the lab never touches production scoring.
 */

const LAB_REPO = "TapanTalukdar004/team-taskboard";

type ReprocessPayload = { issue_key?: unknown };

export async function POST(req: Request) {
  let body: ReprocessPayload;
  try {
    body = (await req.json()) as ReprocessPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const issue_key =
    typeof body.issue_key === "string" ? body.issue_key.trim() : "";
  if (!issue_key) {
    return NextResponse.json(
      { ok: false, error: "issue_key is required" },
      { status: 400 },
    );
  }

  try {
    // Flag the single most-recent assessment row for this issue in the repo.
    await q(
      `UPDATE agent_assessments
          SET reprocess_requested = TRUE
        WHERE id = (
          SELECT id FROM agent_assessments
           WHERE repo = $1 AND issue_key = $2
           ORDER BY run_date DESC, created_at DESC
           LIMIT 1
        )`,
      [LAB_REPO, issue_key],
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 },
    );
  }
}
