/**
 * Private resume storage — candidate resumes are PII, so unlike lib/storage.ts (public 'policies'
 * bucket) these live in a PRIVATE 'resumes' bucket and are only ever exposed through short-lived
 * SIGNED urls generated server-side. No public URL is ever produced for a resume.
 *
 * Bucket 'resumes' is created (public:false) by sql/040's applier. Env: SUPABASE_URL (or derived
 * from DATABASE_URL) + SUPABASE_SERVICE_ROLE_KEY — server-side only.
 */
import { supabaseBaseUrl, safeFilename } from "./storage";

const RESUME_BUCKET = "resumes";

function serviceRoleKey(): string {
  const k = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY env var is not set.");
  return k;
}

/** Build a non-guessable path inside the private bucket. */
export function buildResumePath(originalFilename: string): string {
  const id = (globalThis.crypto as Crypto).randomUUID();
  return `${id}-${safeFilename(originalFilename)}`;
}

/** Upload resume bytes to the PRIVATE bucket. Returns the storage path (no public URL). */
export async function uploadResume(args: {
  path: string;
  body: ArrayBuffer | Uint8Array | Blob;
  contentType?: string;
}): Promise<{ path: string }> {
  const url = `${supabaseBaseUrl()}/storage/v1/object/${RESUME_BUCKET}/${encodeURI(args.path)}`;
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
    throw new Error(`resume upload failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  return { path: args.path };
}

/** Short-lived signed URL so HR (behind login) can view a resume. Default 5 minutes. */
export async function signedResumeUrl(path: string, expiresSec = 300): Promise<string | null> {
  if (!path) return null;
  const url = `${supabaseBaseUrl()}/storage/v1/object/sign/${RESUME_BUCKET}/${encodeURI(path)}`;
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

export async function deleteResume(path: string): Promise<void> {
  if (!path) return;
  const url = `${supabaseBaseUrl()}/storage/v1/object/${RESUME_BUCKET}/${encodeURI(path)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${serviceRoleKey()}`, apikey: serviceRoleKey() },
  });
  if (!res.ok && res.status !== 404) {
    const txt = await res.text().catch(() => "");
    throw new Error(`resume delete failed (${res.status}): ${txt.slice(0, 300)}`);
  }
}
