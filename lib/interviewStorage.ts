/**
 * Private interview-recording storage — interview audio is sensitive PII, so (like lib/resumeStorage.ts
 * for the 'resumes' bucket) recordings live in a PRIVATE 'interviews' bucket and are only ever exposed
 * through short-lived SIGNED urls generated server-side. No public URL is ever produced.
 *
 * Bucket 'interviews' must exist (public:false) — created out-of-band by sql/044's applier, like 'resumes'.
 * Env: SUPABASE_URL (or derived from DATABASE_URL) + SUPABASE_SERVICE_ROLE_KEY — server-side only.
 */
import { supabaseBaseUrl, safeFilename } from "./storage";

const INTERVIEW_BUCKET = "interviews";

function serviceRoleKey(): string {
  const k = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY env var is not set.");
  return k;
}

/** Build a non-guessable path inside the private bucket, scoped under the candidate id. */
export function buildInterviewPath(candidateId: string, originalFilename: string): string {
  const id = (globalThis.crypto as Crypto).randomUUID();
  return `${candidateId}/${id}-${safeFilename(originalFilename)}`;
}

/** Upload recording bytes to the PRIVATE bucket. Returns the storage path (no public URL). */
export async function uploadInterview(args: {
  path: string;
  body: ArrayBuffer | Uint8Array | Blob;
  contentType?: string;
}): Promise<{ path: string }> {
  const url = `${supabaseBaseUrl()}/storage/v1/object/${INTERVIEW_BUCKET}/${encodeURI(args.path)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey()}`,
      apikey: serviceRoleKey(),
      "Content-Type": args.contentType || "application/octet-stream",
      "x-upsert": "true",
    },
    body: args.body as BodyInit,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`interview upload failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  return { path: args.path };
}

/** Short-lived signed URL so HR (behind login) can play a recording. Default 5 minutes. */
export async function signedInterviewUrl(path: string, expiresSec = 300): Promise<string | null> {
  if (!path) return null;
  const url = `${supabaseBaseUrl()}/storage/v1/object/sign/${INTERVIEW_BUCKET}/${encodeURI(path)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey()}`,
      apikey: serviceRoleKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: expiresSec }),
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { signedURL?: string } | null;
  if (!body?.signedURL) return null;
  return `${supabaseBaseUrl()}/storage/v1${body.signedURL}`;
}

/** Delete a recording object (retention / right-to-erasure). Must-fix #3: the metadata cascade does
 *  NOT purge the Storage object, so callers delete the bytes here explicitly. 404 is treated as success. */
export async function deleteInterview(path: string): Promise<void> {
  if (!path) return;
  const url = `${supabaseBaseUrl()}/storage/v1/object/${INTERVIEW_BUCKET}/${encodeURI(path)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${serviceRoleKey()}`, apikey: serviceRoleKey() },
  });
  if (!res.ok && res.status !== 404) {
    const txt = await res.text().catch(() => "");
    throw new Error(`interview delete failed (${res.status}): ${txt.slice(0, 300)}`);
  }
}
