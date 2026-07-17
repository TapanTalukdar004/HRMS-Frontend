import { NextResponse } from "next/server";
import path from "node:path";
import { q } from "@/lib/db";
import { buildResumePath, uploadResume, deleteResume } from "@/lib/resumeStorage";
import { repoRoot, spawnPythonDetached, enqueueScreeningRequest } from "@/lib/pyRun";

/**
 * POST /api/apply  — PUBLIC candidate application (the only write surface open without login).
 * Multipart fields: job_id, name, email, phone?, resume (file), consent (must be "true"),
 *   consent_recording?, plus any extra answers under answers_json?.
 *
 * Safety (Phase 0): candidate rows use UUID keys; resume goes to the PRIVATE 'resumes' bucket;
 * one application per email per job; consent to AI screening is required; every apply is audit-logged.
 * On DB failure after upload, the uploaded resume is rolled back.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_EXT = new Set(["pdf", "doc", "docx", "txt", "rtf"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("expected multipart/form-data");
  }

  const jobId = String(form.get("job_id") || "").trim();
  const name = String(form.get("name") || "").trim().slice(0, 200);
  const email = String(form.get("email") || "").trim().toLowerCase().slice(0, 200);
  const phone = (String(form.get("phone") || "").trim().slice(0, 40) || null) as string | null;
  const consent = String(form.get("consent") || "") === "true";
  const consentRec = String(form.get("consent_recording") || "") === "true";
  let answers: unknown = null;
  const answersRaw = String(form.get("answers_json") || "").trim();
  if (answersRaw) { try { answers = JSON.parse(answersRaw); } catch { answers = { raw: answersRaw }; } }

  if (!jobId) return bad("missing job_id");
  if (!name) return bad("please enter your name");
  if (!EMAIL_RE.test(email)) return bad("please enter a valid email");
  if (!consent) return bad("consent to AI screening is required to apply");

  // Job must exist and be published (public can only apply to open roles).
  const jobs = await q<{ id: string; title: string; is_published: boolean }>(
    "SELECT id, title, is_published FROM job_posts WHERE id = $1",
    [jobId],
  ).catch(() => []);
  if (jobs.length === 0) return bad("this job posting was not found", 404);
  if (!jobs[0].is_published) return bad("this job posting is closed", 410);

  // Duplicate guard (friendly, not a hard error to the user's face).
  const dup = await q<{ id: string }>(
    "SELECT id FROM candidates WHERE job_post_id = $1 AND lower(email) = $2",
    [jobId, email],
  ).catch(() => []);
  if (dup.length > 0) return bad("you have already applied to this role with this email", 409);

  const file = form.get("resume");
  if (!(file instanceof File) || file.size === 0) return bad("please attach your resume");
  if (file.size > MAX_BYTES) return bad("resume file too large (max 15 MB)", 413);
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return bad(`resume type .${ext} not supported (use ${[...ALLOWED_EXT].join(", ")})`, 415);

  // Upload resume to the PRIVATE bucket.
  const resumePath = buildResumePath(file.name);
  try {
    await uploadResume({ path: resumePath, body: await file.arrayBuffer(), contentType: file.type || "application/pdf" });
  } catch (e) {
    return bad(String(e), 502);
  }

  // Insert candidate (DB defaults the UUID id). Roll back the resume on failure.
  let candidateId: string;
  try {
    const rows = await q<{ id: string }>(
      `INSERT INTO candidates (job_post_id, name, email, phone, resume_path, resume_filename,
         form_answers, source, consent_ai, consent_recording, stage)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,'applied') RETURNING id`,
      [jobId, name, email, phone, resumePath, file.name.slice(0, 240),
       answers ? JSON.stringify(answers) : null, "public_form", consent, consentRec],
    );
    candidateId = rows[0].id;
  } catch (e) {
    try { await deleteResume(resumePath); } catch { /* best-effort */ }
    // Unique-violation safety net (race on the dedup check).
    if (String(e).toLowerCase().includes("candidates_job_email_uidx")) {
      return bad("you have already applied to this role with this email", 409);
    }
    return bad(String(e), 500);
  }

  await q(
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail)
     VALUES ($1,'candidate.apply','candidate',$2,$3::jsonb)`,
    ["public_form", candidateId, JSON.stringify({ job_post_id: jobId, email, consent, consent_recording: consentRec })],
  ).catch(() => { /* audit is best-effort, never blocks the application */ });

  // Auto-screen this applicant in the BACKGROUND (fire-and-forget) — advisory only: it produces the score
  // and moves stage applied→screened; it never shortlists/rejects. Non-blocking so the applicant never
  // waits on the ~30s Claude CLI call. Locally, spawn it directly; on Vercel (no venv), queue it for the
  // local poller (perf_tracker/screening_worker.py) instead — see lib/pyRun.ts.
  await q("UPDATE candidates SET screen_status='pending' WHERE id = $1::uuid", [candidateId]).catch(() => {});
  try {
    const root = repoRoot();
    if (root) spawnPythonDetached([path.join(root, "agent", "resume_screener.py"), "--job", jobId, "--candidate", candidateId], root);
    else await enqueueScreeningRequest(jobId, candidateId, "public_form");
  } catch { /* never let auto-screen affect the application response */ }

  return NextResponse.json({ ok: true, message: "Application received", candidate_id: candidateId });
}
