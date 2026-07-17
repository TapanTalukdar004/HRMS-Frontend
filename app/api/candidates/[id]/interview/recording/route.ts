import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { q } from "@/lib/db";
import { accountFor, AUTH_COOKIE } from "@/lib/auth";
import { buildInterviewPath, uploadInterview } from "@/lib/interviewStorage";

/**
 * POST /api/candidates/[id]/interview/recording — multipart upload of the assembled MediaRecorder blob
 * into the PRIVATE 'interviews' bucket (Phase 4a). Behind login AND HR-only. Requires the interview row
 * to carry recording consent. Stores metadata in interview_recordings (never a public URL) and advances
 * interviews.status to 'recorded'. Audio-only in v1.
 * Multipart fields: file (Blob, required), duration_sec?, mime_type?
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 200 * 1024 * 1024; // 200MB guard (audio-only interviews are far smaller)
const RETENTION_DAYS = 60;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await cookies();
  const acct = accountFor(c.get(AUTH_COOKIE)?.value);
  if (!acct) return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });
  if (acct.role !== "hr") return NextResponse.json({ ok: false, error: "HR only" }, { status: 403 });

  const { id } = await ctx.params;

  // consent gate: the interview row must have recording consent recorded
  let iv: { job_post_id: string; consent_recording: boolean } | undefined;
  try {
    iv = (await q<{ job_post_id: string; consent_recording: boolean }>(
      "SELECT job_post_id, consent_recording FROM interviews WHERE candidate_id = $1::uuid", [id],
    ))[0];
  } catch { return NextResponse.json({ ok: false, error: "invalid candidate id" }, { status: 400 }); }
  if (!iv) return NextResponse.json({ ok: false, error: "start the interview first" }, { status: 409 });
  if (!iv.consent_recording) return NextResponse.json({ ok: false, error: "recording consent not on file" }, { status: 403 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "expected multipart form" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "recording too large" }, { status: 413 });

  const mime = String(form.get("mime_type") || (file as File).type || "audio/webm");
  const durationSec = Number(form.get("duration_sec")) || null;
  const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
  const path = buildInterviewPath(id, `interview.${ext}`);
  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    await uploadInterview({ path, body: bytes, contentType: mime });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `upload failed: ${(e as Error).message}` }, { status: 502 });
  }

  const del = new Date(Date.now() + RETENTION_DAYS * 864e5).toISOString().slice(0, 10);
  await q(
    `INSERT INTO interview_recordings (candidate_id, job_post_id, storage_path, mime_type, kind,
        size_bytes, duration_sec, uploaded_by, delete_after)
     VALUES ($1::uuid,$2,$3,$4,'audio',$5,$6,$7,$8)`,
    [id, iv.job_post_id, path, mime, bytes.length, durationSec, acct.username, del],
  );
  await q("UPDATE interviews SET status = 'recorded', updated_at = now() WHERE candidate_id = $1::uuid", [id]);
  await q(
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail)
     VALUES ($1,'interview.recording_uploaded','candidate',$2,$3::jsonb)`,
    [acct.username, id, JSON.stringify({ job_post_id: iv.job_post_id, mime, size_bytes: bytes.length, delete_after: del })],
  ).catch(() => {});

  return NextResponse.json({ ok: true, id, storage_path: path, size_bytes: bytes.length });
}
