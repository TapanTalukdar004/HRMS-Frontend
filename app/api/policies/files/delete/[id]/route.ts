import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { deleteObject } from "@/lib/storage";

/**
 * POST /api/policies/files/delete/[id]
 * Removes both the Storage object AND the DB row.  Storage delete
 * failure is logged but doesn't block the DB delete (avoids
 * orphaned-row inconsistency in the UI).
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id || id.length > 60) {
    return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  }

  // 1. Look up the storage path
  let storagePath: string | null = null;
  try {
    const rows = await q<{ storage_path: string }>(
      `SELECT storage_path FROM policy_files WHERE id = $1 LIMIT 1`,
      [id],
    );
    storagePath = rows[0]?.storage_path ?? null;
    if (!storagePath) {
      return NextResponse.json(
        { ok: false, error: "not found" },
        { status: 404 },
      );
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 },
    );
  }

  // 2. Try to drop the Storage object (best effort)
  let storageError: string | null = null;
  try {
    await deleteObject(storagePath);
  } catch (e) {
    storageError = String(e);
    console.warn("policy file delete: storage drop failed:", e);
  }

  // 3. Always delete the DB row
  try {
    await q(`DELETE FROM policy_files WHERE id = $1`, [id]);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e), storage_error: storageError },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, storage_error: storageError });
}
