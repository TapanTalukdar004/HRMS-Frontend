import { NextResponse } from "next/server";
import { q } from "@/lib/db";

/**
 * POST /api/policies/update/[id]
 * Body: partial fields to update.  Only title, category, summary,
 * key_points, full_text, source_pages are editable; provenance fields
 * (extracted_by, source_doc, created_by, timestamps) are locked.
 */

type UpdatePayload = {
  title?: unknown;
  category?: unknown;
  summary?: unknown;
  key_points?: unknown;
  full_text?: unknown;
  source_pages?: unknown;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id || id.length > 60) {
    return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  }

  let body: UpdatePayload;
  try {
    body = (await req.json()) as UpdatePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  // Build a dynamic SET clause.  Use named-style params via positional;
  // each provided field gets its own placeholder.
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (body.title !== undefined) {
    const v = String(body.title).trim().slice(0, 240);
    if (!v) {
      return NextResponse.json(
        { ok: false, error: "title cannot be empty" },
        { status: 400 },
      );
    }
    sets.push(`title = $${idx++}`);
    params.push(v);
  }
  if (body.category !== undefined) {
    sets.push(`category = $${idx++}`);
    params.push(
      body.category == null
        ? null
        : String(body.category).trim().slice(0, 120) || null,
    );
  }
  if (body.summary !== undefined) {
    sets.push(`summary = $${idx++}`);
    params.push(
      body.summary == null
        ? null
        : String(body.summary).slice(0, 4000) || null,
    );
  }
  if (body.full_text !== undefined) {
    sets.push(`full_text = $${idx++}`);
    params.push(
      body.full_text == null
        ? null
        : String(body.full_text).slice(0, 12_000) || null,
    );
  }
  if (body.source_pages !== undefined) {
    sets.push(`source_pages = $${idx++}`);
    params.push(
      body.source_pages == null
        ? null
        : String(body.source_pages).trim().slice(0, 120) || null,
    );
  }
  if (body.key_points !== undefined) {
    let key_points: { label: string; value: string }[] = [];
    if (Array.isArray(body.key_points)) {
      for (const kp of body.key_points) {
        if (kp && typeof kp === "object") {
          const label = String(
            (kp as { label?: unknown }).label ?? "",
          ).trim();
          const value = String(
            (kp as { value?: unknown }).value ?? "",
          ).trim();
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
    sets.push(`key_points = $${idx++}::jsonb`);
    params.push(JSON.stringify(key_points));
  }

  if (sets.length === 0) {
    return NextResponse.json(
      { ok: false, error: "nothing to update" },
      { status: 400 },
    );
  }

  sets.push(`updated_at = NOW()`);
  params.push(id);

  try {
    await q(
      `UPDATE policy_documents SET ${sets.join(", ")} WHERE id = $${idx}`,
      params,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 },
    );
  }
}
