import { NextResponse } from "next/server";
import { q } from "@/lib/db";

/**
 * GET /api/policies/list
 * Returns all rich policies from policy_documents, newest first.
 * Used by /policies page to render the cards.
 */
export const dynamic = "force-dynamic";

type PolicyRow = {
  id: string;
  title: string;
  category: string | null;
  summary: string | null;
  key_points: { label: string; value: string }[] | null;
  full_text: string | null;
  source_doc: string | null;
  source_pages: string | null;
  extracted_by: "ai" | "manual";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET() {
  try {
    const rows = await q<PolicyRow>(
      `SELECT id, title, category, summary, key_points, full_text,
              source_doc, source_pages, extracted_by, created_by,
              created_at::text, updated_at::text
       FROM policy_documents
       ORDER BY created_at DESC`,
    );
    return NextResponse.json({ ok: true, policies: rows });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 },
    );
  }
}
