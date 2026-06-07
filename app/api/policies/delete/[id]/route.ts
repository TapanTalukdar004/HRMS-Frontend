import { NextResponse } from "next/server";
import { q } from "@/lib/db";

/**
 * POST /api/policies/delete/[id]
 * Hard-deletes a policy_documents row.
 *
 * (Deliberately no soft-delete column — the table is small, audits live
 * in source_doc + created_by, and accidental deletes are rare in HR's
 * workflow.  If we add versioning later, switch to UPDATE
 * deleted_at = NOW() and filter in /list.)
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id || id.length > 60) {
    return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  }
  try {
    await q(`DELETE FROM policy_documents WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 },
    );
  }
}
