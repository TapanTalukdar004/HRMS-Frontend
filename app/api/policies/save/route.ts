import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { q } from "@/lib/db";

/**
 * POST /api/policies/save
 * Body: { title, category?, summary?, key_points?, full_text?,
 *         source_doc?, source_pages?, extracted_by?, created_by? }
 * Used both for manual "Create policy" form AND for accepting an
 * AI-extracted draft in the upload preview screen.
 */

type SavePayload = {
  title?: unknown;
  category?: unknown;
  summary?: unknown;
  key_points?: unknown;
  full_text?: unknown;
  source_doc?: unknown;
  source_pages?: unknown;
  extracted_by?: unknown;   // 'ai' | 'manual'
  created_by?: unknown;
};

export async function POST(req: Request) {
  let body: SavePayload;
  try {
    body = (await req.json()) as SavePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json(
      { ok: false, error: "title is required" },
      { status: 400 },
    );
  }

  // Whitelist + sanitise the fields.
  const category =
    body.category != null ? String(body.category).trim().slice(0, 120) : null;
  const summary =
    body.summary != null ? String(body.summary).trim().slice(0, 4000) : null;
  const full_text =
    body.full_text != null
      ? String(body.full_text).slice(0, 12_000)
      : null;
  const source_doc =
    body.source_doc != null
      ? String(body.source_doc).trim().slice(0, 240)
      : null;
  const source_pages =
    body.source_pages != null
      ? String(body.source_pages).trim().slice(0, 120)
      : null;
  const extracted_by =
    body.extracted_by === "ai" ? "ai" : "manual";
  const created_by =
    body.created_by != null
      ? String(body.created_by).trim().slice(0, 80) || null
      : null;

  // Coerce key_points to [{label, value}] with bounded sizes.
  let key_points: { label: string; value: string }[] = [];
  if (Array.isArray(body.key_points)) {
    for (const kp of body.key_points) {
      if (kp && typeof kp === "object") {
        const label = String((kp as { label?: unknown }).label ?? "").trim();
        const value = String((kp as { value?: unknown }).value ?? "").trim();
        if (label && value) {
          key_points.push({
            label: label.slice(0, 120),
            value: value.slice(0, 400),
          });
        }
      }
    }
    key_points = key_points.slice(0, 30);
  }

  const id = randomUUID();
  try {
    await q(
      `INSERT INTO policy_documents (
         id, title, category, summary, key_points, full_text,
         source_doc, source_pages, extracted_by, created_by
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)`,
      [
        id,
        title.slice(0, 240),
        category,
        summary,
        JSON.stringify(key_points),
        full_text,
        source_doc,
        source_pages,
        extracted_by,
        created_by,
      ],
    );
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 },
    );
  }
}
