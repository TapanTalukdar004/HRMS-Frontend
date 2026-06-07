import { NextResponse } from "next/server";
import { q } from "@/lib/db";

/**
 * GET /api/policies/files/list
 * Returns every policy_files row, newest first.  No pagination yet —
 * HR's library will stay under a few hundred files for the foreseeable
 * future.
 */
export const dynamic = "force-dynamic";

type FileRow = {
  id: string;
  title: string;
  filename_original: string;
  storage_path: string;
  public_url: string;
  size_bytes: number | null;
  mime_type: string | null;
  category: string | null;
  description: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  updated_at: string;
};

export async function GET() {
  try {
    const rows = await q<FileRow>(
      `SELECT id, title, filename_original, storage_path, public_url,
              size_bytes, mime_type, category, description, uploaded_by,
              uploaded_at::text, updated_at::text
       FROM policy_files
       ORDER BY uploaded_at DESC`,
    );
    return NextResponse.json({ ok: true, files: rows });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 },
    );
  }
}
