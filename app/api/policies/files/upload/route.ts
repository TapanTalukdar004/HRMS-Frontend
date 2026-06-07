import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { q } from "@/lib/db";
import {
  buildStoragePath,
  publicUrl,
  uploadObject,
} from "@/lib/storage";

/**
 * POST /api/policies/files/upload
 * Multipart fields:
 *   file        — the PDF (or .docx, .xlsx, etc.) bytes (required)
 *   title       — human-readable title (optional; defaults to cleaned filename)
 *   category    — optional category tag
 *   description — optional one-liner
 *   uploaded_by — optional uploader handle
 *
 * Behaviour:
 *   1. Validate file (size + name)
 *   2. Stream to Supabase Storage bucket "policies"
 *   3. Insert metadata row in policy_files
 *   4. Return the created row
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Match the FastAPI cap so the UX is consistent.
const MAX_BYTES = 25 * 1024 * 1024;   // 25 MB — HR policy PDFs are tiny

const ALLOWED_EXT = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "txt", "md", "csv", "rtf",
]);

function cleanTitleFromFilename(name: string): string {
  // Strip the unix-timestamp prefix HR's tools tend to add:
  //   "1690438746.6863+Purchase+Process.pdf"  -> "Purchase Process"
  let t = name;
  // Drop extension
  const dot = t.lastIndexOf(".");
  if (dot > 0) t = t.slice(0, dot);
  // Strip leading "1234567890.123+" (unix ts with millis + plus sign)
  t = t.replace(/^\d{8,14}(?:\.\d+)?\+?/, "");
  // Strip duplicate-marker suffixes like " (1)" or "-1-1"
  t = t.replace(/\s*\(\d+\)\s*$/, "");
  t = t.replace(/(?:-\d+)+$/, "");
  // Replace + and _ with spaces
  t = t.replace(/[+_]+/g, " ");
  // Collapse whitespace
  t = t.replace(/\s+/g, " ").trim();
  // Final fallback if everything got stripped
  if (!t) t = "Untitled";
  // Title-case-ish prettify of common acronyms
  t = t
    .replace(/\bteamlogger\b/gi, "TeamLogger")
    .replace(/\bspoc\b/gi, "SPOC")
    .replace(/\bpip\b/gi, "PIP")
    .replace(/\bjira\b/gi, "JIRA")
    .replace(/\bgoa\b/gi, "Goa");
  return t.slice(0, 240);
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "expected multipart/form-data" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "missing 'file' field" },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json(
      { ok: false, error: "empty file" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `file too large (${file.size.toLocaleString()} bytes; limit ${MAX_BYTES.toLocaleString()})`,
      },
      { status: 413 },
    );
  }

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      {
        ok: false,
        error: `extension .${ext} not allowed. Supported: ${Array.from(ALLOWED_EXT).join(", ")}`,
      },
      { status: 415 },
    );
  }

  const title =
    String(form.get("title") || "").trim().slice(0, 240) ||
    cleanTitleFromFilename(file.name);
  const category =
    (String(form.get("category") || "").trim() || null) as string | null;
  const description =
    (String(form.get("description") || "").trim() || null) as string | null;
  const uploaded_by =
    (String(form.get("uploaded_by") || "").trim() || "dashboard") as string;

  // Upload to Storage
  const storagePath = buildStoragePath(file.name);
  const ab = await file.arrayBuffer();
  let url: string;
  try {
    const out = await uploadObject({
      path: storagePath,
      body: ab,
      contentType: file.type || "application/octet-stream",
    });
    url = out.url;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 502 },
    );
  }

  // Insert DB row
  const id = randomUUID();
  try {
    await q(
      `INSERT INTO policy_files (
         id, title, filename_original, storage_path, public_url,
         size_bytes, mime_type, category, description, uploaded_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        title,
        file.name.slice(0, 240),
        storagePath,
        url,
        file.size,
        file.type || null,
        category,
        description,
        uploaded_by,
      ],
    );
  } catch (e) {
    // DB insert failed AFTER storage upload — roll back the object.
    try {
      const { deleteObject } = await import("@/lib/storage");
      await deleteObject(storagePath);
    } catch {
      // best-effort cleanup
    }
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    file: {
      id,
      title,
      filename_original: file.name,
      storage_path: storagePath,
      public_url: url,
      size_bytes: file.size,
      mime_type: file.type || null,
      category,
      description,
      uploaded_by,
    },
  });
}

/** Configure Next.js to allow up to MAX_BYTES in the request body. */
export const fetchCache = "force-no-store";
