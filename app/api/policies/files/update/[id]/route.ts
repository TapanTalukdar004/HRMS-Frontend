import { NextResponse } from "next/server";
import { q } from "@/lib/db";

/**
 * POST /api/policies/files/update/[id]
 * Editable fields: title, category, description.
 * Provenance fields (filename_original, storage_path, public_url,
 * size_bytes, mime_type, uploaded_by, timestamps) are locked.
 */
type UpdatePayload = {
  title?: unknown;
  category?: unknown;
  description?: unknown;
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
  if (body.description !== undefined) {
    sets.push(`description = $${idx++}`);
    params.push(
      body.description == null
        ? null
        : String(body.description).slice(0, 1000) || null,
    );
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
      `UPDATE policy_files SET ${sets.join(", ")} WHERE id = $${idx}`,
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
